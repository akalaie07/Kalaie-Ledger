import type { Metadata } from "next";
import Link from "next/link";
import { Plus, TrendingUp, Clock, AlertTriangle, CheckCircle } from "lucide-react";

import { requireSession } from "@/lib/auth/get-current-org";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { hasFeature } from "@/lib/features";
import { DealFilterTabs } from "./_components/deal-filter-tabs";
import { DealSearch } from "./_components/deal-search";
import { DealsTable } from "./_components/deals-table";
import type { DealRowData } from "./_components/deals-table";

export const metadata: Metadata = { title: "Deals — Buchhaltung" };

function fmt(v: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);
}

type Category = "msm_gold" | "msm_silber" | "msm_bronze" | "msm_alt" | "msm" | "mcc_monatlich" | "mcc_jaehrlich" | "mcc" | "andere";

function getCategory(productName?: string | null, productType?: string | null): Category {
  if (!productName) return "andere";
  const name = productName.toLowerCase();
  if (name.includes("maestro champion circle") || name.includes("sales maestro circle") || /\bmcc\b/.test(name)) {
    // MCC sub-type comes from product_type field (clean), fallback to name matching
    if (productType === "subscription_monthly") return "mcc_monatlich";
    if (productType === "subscription_yearly") return "mcc_jaehrlich";
    if (name.includes("monatl") || name.includes("monthly")) return "mcc_monatlich";
    if (name.includes("jährlich") || name.includes("jaehrlich") || name.includes("yearly") || name.includes("annual")) return "mcc_jaehrlich";
    return "mcc";
  }
  if (name.includes("maestro sales masterclass") || /\bmsm\b/.test(name)) {
    if (name.includes("gold")) return "msm_gold";
    if (name.includes("silber") || name.includes("silver")) return "msm_silber";
    if (name.includes("bronze")) return "msm_bronze";
    if (name.includes("alt") || name.includes("legacy") || name.includes("classic")) return "msm_alt";
    return "msm";
  }
  return "andere";
}

function isMsmCategory(cat: Category): boolean {
  return cat === "msm" || cat === "msm_gold" || cat === "msm_silber" || cat === "msm_bronze" || cat === "msm_alt";
}

function isMccCategory(cat: Category): boolean {
  return cat === "mcc" || cat === "mcc_monatlich" || cat === "mcc_jaehrlich";
}

function KpiCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  accent: "emerald" | "amber" | "rose" | "blue";
}) {
  const colors = {
    emerald: "text-emerald-400 bg-emerald-500/10",
    amber: "text-amber-400 bg-amber-500/10",
    rose: "text-rose-400 bg-rose-500/10",
    blue: "text-blue-400 bg-blue-500/10",
  } as const;
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        <span className={cn("rounded-full p-1.5", colors[accent])}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const { filter = "alle", q = "" } = await searchParams;
  const session = await requireSession();
  const supabase = await createClient();

  const [{ data: deals }, { data: balance }] = await Promise.all([
    supabase
      .from("deals")
      .select(
        "id, customer_name, total_price, payment_type, close_date, mahnung_required, inkasso_required, chargeback, onboarding_done, update_call_done, order_id, notes, down_payment, platforms(name), products(name, product_type), closers(name)",
      )
      .eq("organization_id", session.organizationId)
      .order("close_date", { ascending: false }),
    supabase
      .from("deal_balance")
      .select("paid_sum, open_sum, overdue_sum")
      .eq("organization_id", session.organizationId),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allRows = (deals ?? []) as any[];
  const showProductFilter = hasFeature(session, "msm_mcc_filter");

  // Count per category (nur wenn Feature aktiv)
  const counts: Record<string, number> = { alle: allRows.length };
  if (showProductFilter) {
    counts.msm = 0;
    counts.mcc = 0;
    counts.msm_gold = 0;
    counts.msm_silber = 0;
    counts.msm_bronze = 0;
    counts.msm_alt = 0;
    counts.mcc_monatlich = 0;
    counts.mcc_jaehrlich = 0;
    for (const d of allRows) {
      const cat = getCategory(d.products?.name, (d.products as Record<string, unknown>)?.product_type as string | null);
      if (isMccCategory(cat)) {
        counts.mcc++; // MCC Gesamt
        if (cat === "mcc_monatlich") counts.mcc_monatlich++;
        else if (cat === "mcc_jaehrlich") counts.mcc_jaehrlich++;
      } else if (isMsmCategory(cat)) {
        counts.msm++; // MSM Gesamt
        if (cat === "msm_gold") counts.msm_gold++;
        else if (cat === "msm_silber") counts.msm_silber++;
        else if (cat === "msm_bronze") counts.msm_bronze++;
        else if (cat === "msm_alt") counts.msm_alt++;
      }
    }
  }

  // Apply category filter (nur wenn Feature aktiv)
  const MSM_SUB_FILTERS = ["msm_gold", "msm_silber", "msm_bronze", "msm_alt"];
  const MCC_SUB_FILTERS = ["mcc_monatlich", "mcc_jaehrlich"];
  const categoryRows = showProductFilter
    ? filter === "msm"
      ? allRows.filter((d) => isMsmCategory(getCategory(d.products?.name, (d.products as Record<string, unknown>)?.product_type as string | null)))
      : filter === "mcc"
      ? allRows.filter((d) => isMccCategory(getCategory(d.products?.name, (d.products as Record<string, unknown>)?.product_type as string | null)))
      : MSM_SUB_FILTERS.includes(filter)
      ? allRows.filter((d) => getCategory(d.products?.name, (d.products as Record<string, unknown>)?.product_type as string | null) === filter)
      : MCC_SUB_FILTERS.includes(filter)
      ? allRows.filter((d) => getCategory(d.products?.name, (d.products as Record<string, unknown>)?.product_type as string | null) === filter)
      : allRows
    : allRows;

  // Apply search filter
  const searchQuery = q.toLowerCase().trim();
  const rows = searchQuery
    ? categoryRows.filter((d) =>
        d.customer_name.toLowerCase().includes(searchQuery) ||
        (d.order_id ?? "").toLowerCase().includes(searchQuery) ||
        (d.products?.name ?? "").toLowerCase().includes(searchQuery) ||
        (d.closers?.name ?? "").toLowerCase().includes(searchQuery),
      )
    : categoryRows;

  const dealIds = rows.map((d) => d.id);

  const [{ data: oneTimePayments }, { data: installmentRows }] = dealIds.length > 0
    ? await Promise.all([
        supabase.from("one_time_payments").select("deal_id, paid").in("deal_id", dealIds),
        supabase.from("installments").select("deal_id, paid, amount").in("deal_id", dealIds),
      ])
    : [{ data: [] }, { data: [] }];

  // Build per-deal payment lookup
  const otpMap = new Map<string, boolean>();
  for (const o of oneTimePayments ?? []) otpMap.set(o.deal_id, o.paid);

  const instMap = new Map<string, { total: number; paid: number; perRate: number; openAmount: number }>();
  for (const i of installmentRows ?? []) {
    const cur = instMap.get(i.deal_id) ?? { total: 0, paid: 0, perRate: 0, openAmount: 0 };
    instMap.set(i.deal_id, {
      total: cur.total + 1,
      paid: cur.paid + (i.paid ? 1 : 0),
      perRate: cur.total === 0 ? (i.amount ?? 0) : cur.perRate, // erste Rate als Referenz
      openAmount: cur.openAmount + (!i.paid ? (i.amount ?? 0) : 0),
    });
  }

  const bal = balance ?? [];
  const isAdmin = session.role === "admin";

  const totalRevenue = rows.reduce((s, d) => s + (d.total_price as number), 0);
  const paidSum = bal.reduce((s, b) => s + (Number(b.paid_sum) || 0), 0);
  const openSum = bal.reduce((s, b) => s + (Number(b.open_sum) || 0), 0);
  const overdueSum = bal.reduce((s, b) => s + (Number(b.overdue_sum) || 0), 0);

  const dealRows: DealRowData[] = rows.map((d) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const da = d as any;
    const inst = instMap.get(d.id);
    return {
      id: d.id,
      customer_name: d.customer_name,
      order_id: d.order_id ?? null,
      product_name: da.products?.name ?? null,
      product_type: da.products?.product_type ?? null,
      platform_name: da.platforms?.name ?? null,
      closer_name: da.closers?.name ?? null,
      total_price: d.total_price as number,
      payment_type: d.payment_type as "one_time" | "installments",
      close_date: d.close_date,
      down_payment: (d.down_payment as number | null) ?? null,
      notes: d.notes ?? null,
      mahnung_required: d.mahnung_required ?? false,
      inkasso_required: d.inkasso_required ?? false,
      chargeback: (d.chargeback as boolean) ?? false,
      onboarding_done: d.onboarding_done ?? false,
      update_call_done: (d.update_call_done as boolean) ?? false,
      otp_paid: d.payment_type === "one_time" ? (otpMap.get(d.id) ?? false) : null,
      inst_total: inst?.total ?? 0,
      inst_paid: inst?.paid ?? 0,
      inst_open_amount: inst?.openAmount ?? 0,
    };
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Deals</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} {rows.length === 1 ? "Eintrag" : "Einträge"}
          </p>
        </div>
        <Link href="/deals/new" className={buttonVariants({ size: "sm" })}>
          <Plus className="mr-1.5 h-4 w-4" />
          Neuer Deal
        </Link>
      </div>

      {/* Filter tabs + Search */}
      <div className="flex items-center justify-between gap-4">
        <DealFilterTabs active={filter} counts={counts} showProductFilter={showProductFilter} />
        <DealSearch filter={filter} defaultValue={q || undefined} />
      </div>

      {/* KPI cards */}
      {rows.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Gesamtumsatz" value={fmt(totalRevenue)} icon={TrendingUp} accent="blue" />
          <KpiCard label="Eingegangen" value={fmt(paidSum)} icon={CheckCircle} accent="emerald" />
          <KpiCard label="Offen" value={fmt(openSum)} icon={Clock} accent="amber" />
          <KpiCard label="Überfällig" value={fmt(overdueSum)} icon={AlertTriangle} accent="rose" />
        </div>
      )}

      {/* Table */}
      <DealsTable rows={dealRows} isAdmin={isAdmin} filter={filter} />
    </div>
  );
}

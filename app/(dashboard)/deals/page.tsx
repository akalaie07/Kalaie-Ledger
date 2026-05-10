import type { Metadata } from "next";
import Link from "next/link";
import { Plus, TrendingUp, Clock, AlertTriangle, CheckCircle, HandshakeIcon, PhoneCall, TriangleAlert, Gavel } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

import { requireSession } from "@/lib/auth/get-current-org";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { hasFeature } from "@/lib/features";
import { DealRowActions } from "./_components/deal-row-actions";
import { DealFilterTabs } from "./_components/deal-filter-tabs";
import { DealSearch } from "./_components/deal-search";
import { NotePopup } from "./_components/note-popup";

export const metadata: Metadata = { title: "Deals — Buchhaltung" };

const PAYMENT_LABEL: Record<string, string> = {
  one_time: "Einmalzahlung",
  installments: "Ratenzahlung",
};

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
        "id, customer_name, total_price, payment_type, close_date, mahnung_required, inkasso_required, onboarding_done, update_call_done, order_id, notes, down_payment, platforms(name), products(name, product_type), closers(name), sales_partners(name)",
      )
      .eq("organization_id", session.organizationId)
      .order("close_date", { ascending: false }),
    supabase
      .from("deal_balance")
      .select("paid_sum, open_sum, overdue_sum")
      .eq("organization_id", session.organizationId),
  ]);

  const allRows = deals ?? [];
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
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Kunde</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Bestell-ID</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Produkt</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Plattform</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Closer</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Preis</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Zahlung</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Bezahlt</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Abschluss</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              {isAdmin && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((deal) => (
              <tr key={deal.id} className="group hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/deals/${deal.id}`}
                      className="font-medium hover:underline underline-offset-4"
                    >
                      {deal.customer_name}
                    </Link>
                    <NotePopup dealId={deal.id} notes={deal.notes as string | null} />
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground tabular-nums text-xs">
                  {deal.order_id ? `#${deal.order_id}` : "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{deal.products?.name ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{deal.platforms?.name ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{deal.closers?.name ?? "—"}</td>
                <td className="px-4 py-3 text-right font-medium tabular-nums">
                  {fmt(deal.total_price as number)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                      deal.payment_type === "one_time"
                        ? "bg-blue-500/15 text-blue-400"
                        : "bg-purple-500/15 text-purple-400",
                    )}
                  >
                    {PAYMENT_LABEL[deal.payment_type]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/deals/${deal.id}`} className="block space-y-0.5">
                    {deal.payment_type === "one_time" ? (
                      (() => {
                        const isPaid = otpMap.get(deal.id) ?? false;
                        const dp = (deal as Record<string, unknown>).down_payment as number | null;
                        const openAmt = isPaid ? 0 : (deal.total_price as number) - (dp ?? 0);
                        return (
                          <>
                            <span className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                              isPaid ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400",
                            )}>
                              {isPaid ? "Bezahlt" : "Offen"}
                            </span>
                            {(dp || (!isPaid && openAmt > 0)) && (
                              <p className="text-xs text-muted-foreground">
                                {dp ? `AZ ${fmt(dp)}` : ""}
                                {dp && !isPaid && openAmt > 0 ? " · " : ""}
                                {!isPaid && openAmt > 0 ? <span className="text-rose-400/80">{fmt(openAmt)} offen</span> : null}
                              </p>
                            )}
                          </>
                        );
                      })()
                    ) : (
                      (() => {
                        const inst = instMap.get(deal.id);
                        const paid = inst?.paid ?? 0;
                        const total = inst?.total ?? 0;
                        if (total === 0) return <span className="text-muted-foreground/40 text-xs">—</span>;
                        const done = paid === total;
                        const openAmount = inst?.openAmount ?? 0;
                        const dp = (deal as Record<string, unknown>).down_payment as number | null;
                        return (
                          <>
                            <span className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                              done
                                ? "bg-emerald-500/15 text-emerald-400"
                                : paid > 0
                                ? "bg-amber-500/15 text-amber-400"
                                : "bg-rose-500/15 text-rose-400",
                            )}>
                              {paid}/{total} Raten
                            </span>
                            {(dp || (!done && openAmount > 0)) && (
                              <p className="text-xs text-muted-foreground">
                                {dp ? `AZ ${fmt(dp)}` : ""}
                                {dp && !done && openAmount > 0 ? " · " : ""}
                                {!done && openAmount > 0 ? <span className="text-rose-400/80">{fmt(openAmount)} offen</span> : null}
                              </p>
                            )}
                          </>
                        );
                      })()
                    )}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground tabular-nums">
                  {format(new Date(deal.close_date), "dd.MM.yyyy", { locale: de })}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span
                      title="Onboarding"
                      className={cn(
                        "rounded p-0.5 transition-colors",
                        deal.onboarding_done
                          ? "text-emerald-400"
                          : "text-muted-foreground/25",
                      )}
                    >
                      <HandshakeIcon className="h-3.5 w-3.5" />
                    </span>
                    <span
                      title="Update-Call"
                      className={cn(
                        "rounded p-0.5 transition-colors",
                        (deal as Record<string, unknown>).update_call_done
                          ? "text-blue-400"
                          : "text-muted-foreground/25",
                      )}
                    >
                      <PhoneCall className="h-3.5 w-3.5" />
                    </span>
                    <span
                      title="Mahnung"
                      className={cn(
                        "rounded p-0.5 transition-colors",
                        deal.mahnung_required
                          ? "text-amber-400"
                          : "text-muted-foreground/25",
                      )}
                    >
                      <TriangleAlert className="h-3.5 w-3.5" />
                    </span>
                    <span
                      title="Inkasso"
                      className={cn(
                        "rounded p-0.5 transition-colors",
                        deal.inkasso_required
                          ? "text-rose-400"
                          : "text-muted-foreground/25",
                      )}
                    >
                      <Gavel className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </td>
                {isAdmin && (
                  <td className="px-3 py-3">
                    <DealRowActions
                      dealId={deal.id}
                      mahnungRequired={deal.mahnung_required ?? false}
                      inkassoRequired={deal.inkasso_required}
                    />
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 11 : 10} className="px-4 py-10 text-center text-muted-foreground">
                  {filter !== "alle"
                    ? `Keine ${filter.toUpperCase()}-Deals vorhanden.`
                    : <>Noch keine Deals vorhanden.{" "}
                        <Link href="/deals/new" className="text-foreground underline-offset-4 hover:underline">
                          Ersten Deal anlegen
                        </Link>
                      </>
                  }
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

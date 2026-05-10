import type { Metadata } from "next";
import Link from "next/link";
import { Plus, TrendingUp, Clock, AlertTriangle, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

import { requireSession } from "@/lib/auth/get-current-org";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DealRowActions } from "./_components/deal-row-actions";

export const metadata: Metadata = { title: "Deals — Buchhaltung" };

const PAYMENT_LABEL: Record<string, string> = {
  one_time: "Einmalzahlung",
  installments: "Ratenzahlung",
};

function fmt(v: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);
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

export default async function DealsPage() {
  const session = await requireSession();
  const supabase = await createClient();

  const [{ data: deals }, { data: balance }] = await Promise.all([
    supabase
      .from("deals")
      .select(
        "id, customer_name, total_price, payment_type, close_date, inkasso_required, onboarding_done, order_id, platforms(name), products(name), closers(name), sales_partners(name)",
      )
      .eq("organization_id", session.organizationId)
      .order("close_date", { ascending: false }),
    supabase
      .from("deal_balance")
      .select("paid_sum, open_sum, overdue_sum")
      .eq("organization_id", session.organizationId),
  ]);

  const dealIds = (deals ?? []).map((d) => d.id);

  const [{ data: oneTimePayments }, { data: installmentRows }] = dealIds.length > 0
    ? await Promise.all([
        supabase.from("one_time_payments").select("deal_id, paid").in("deal_id", dealIds),
        supabase.from("installments").select("deal_id, paid").in("deal_id", dealIds),
      ])
    : [{ data: [] }, { data: [] }];

  // Build per-deal payment lookup
  const otpMap = new Map<string, boolean>();
  for (const o of oneTimePayments ?? []) otpMap.set(o.deal_id, o.paid);

  const instMap = new Map<string, { total: number; paid: number }>();
  for (const i of installmentRows ?? []) {
    const cur = instMap.get(i.deal_id) ?? { total: 0, paid: 0 };
    instMap.set(i.deal_id, { total: cur.total + 1, paid: cur.paid + (i.paid ? 1 : 0) });
  }

  const rows = deals ?? [];
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
              {isAdmin && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((deal) => (
              <tr key={deal.id} className="group hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <Link
                    href={`/deals/${deal.id}`}
                    className="font-medium hover:underline underline-offset-4"
                  >
                    {deal.customer_name}
                  </Link>
                  {deal.inkasso_required && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-rose-500/15 px-1.5 py-0.5 text-xs font-medium text-rose-400">
                      Inkasso
                    </span>
                  )}
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
                  <Link href={`/deals/${deal.id}`} className="block">
                    {deal.payment_type === "one_time" ? (
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        otpMap.get(deal.id)
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-rose-500/15 text-rose-400",
                      )}>
                        {otpMap.get(deal.id) ? "Ja" : "Nein"}
                      </span>
                    ) : (
                      (() => {
                        const inst = instMap.get(deal.id);
                        const paid = inst?.paid ?? 0;
                        const total = inst?.total ?? 0;
                        const done = paid === total && total > 0;
                        return (
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
                        );
                      })()
                    )}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground tabular-nums">
                  {format(new Date(deal.close_date), "dd.MM.yyyy", { locale: de })}
                </td>
                {isAdmin && (
                  <td className="px-3 py-3">
                    <DealRowActions dealId={deal.id} />
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                  Noch keine Deals vorhanden.{" "}
                  <Link href="/deals/new" className="text-foreground underline-offset-4 hover:underline">
                    Ersten Deal anlegen
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

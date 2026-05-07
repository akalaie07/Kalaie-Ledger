import type { Metadata } from "next";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { de } from "date-fns/locale";

import { requireRole } from "@/lib/auth/get-current-org";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Berichte — Buchhaltung" };

function fmt(v: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);
}

function pct(part: number, total: number) {
  if (total === 0) return "0 %";
  return `${Math.round((part / total) * 100)} %`;
}

export default async function BerichtePage() {
  const session = await requireRole("admin");
  const supabase = await createClient();

  // Last 12 months
  const today = new Date();
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = subMonths(today, 11 - i);
    return {
      label: format(d, "MMM yyyy", { locale: de }),
      shortLabel: format(d, "MMM", { locale: de }),
      from: startOfMonth(d).toISOString().slice(0, 10),
      to: endOfMonth(d).toISOString().slice(0, 10),
    };
  });

  const [{ data: dealsAll }, { data: closersAll }, { data: partnersAll }] =
    await Promise.all([
      supabase
        .from("deals")
        .select("id, total_price, close_date, closer_id, sales_partner_id")
        .eq("organization_id", session.organizationId)
        .gte("close_date", months[0].from)
        .lte("close_date", months[11].to),
      supabase
        .from("closers")
        .select("id, name, commission_rate")
        .eq("organization_id", session.organizationId),
      supabase
        .from("sales_partners")
        .select("id, name, commission_rate")
        .eq("organization_id", session.organizationId),
    ]);

  const deals = dealsAll ?? [];
  const closerById = new Map((closersAll ?? []).map((c) => [c.id, c]));
  const partnerById = new Map((partnersAll ?? []).map((p) => [p.id, p]));

  // Monthly aggregation
  const monthly = months.map(({ label, shortLabel, from, to }) => {
    const inMonth = deals.filter((d) => d.close_date >= from && d.close_date <= to);
    const revenue = inMonth.reduce((s, d) => s + (Number(d.total_price) || 0), 0);
    return { label, shortLabel, revenue, count: inMonth.length };
  });

  const totalRevenue = monthly.reduce((s, m) => s + m.revenue, 0);
  const maxRevenue = Math.max(...monthly.map((m) => m.revenue), 1);

  // Closer commission summary
  const closerRevMap = new Map<string, { name: string; revenue: number; commission: number; rate: number }>();
  for (const d of deals) {
    if (!d.closer_id) continue;
    const c = closerById.get(d.closer_id);
    if (!c) continue;
    const rev = Number(d.total_price) || 0;
    const rate = Number(c.commission_rate) || 0;
    const prev = closerRevMap.get(d.closer_id) ?? { name: c.name, revenue: 0, commission: 0, rate };
    closerRevMap.set(d.closer_id, {
      name: c.name,
      revenue: prev.revenue + rev,
      commission: prev.commission + rev * rate,
      rate,
    });
  }
  const closers = Array.from(closerRevMap.values()).sort((a, b) => b.revenue - a.revenue);

  // Partner commission summary
  const partnerRevMap = new Map<string, { name: string; revenue: number; commission: number; rate: number }>();
  for (const d of deals) {
    if (!d.sales_partner_id) continue;
    const p = partnerById.get(d.sales_partner_id);
    if (!p) continue;
    const rev = Number(d.total_price) || 0;
    const rate = Number(p.commission_rate) || 0;
    const prev = partnerRevMap.get(d.sales_partner_id) ?? { name: p.name, revenue: 0, commission: 0, rate };
    partnerRevMap.set(d.sales_partner_id, {
      name: p.name,
      revenue: prev.revenue + rev,
      commission: prev.commission + rev * rate,
      rate,
    });
  }
  const partners = Array.from(partnerRevMap.values()).sort((a, b) => b.revenue - a.revenue);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Berichte</h1>
        <p className="text-sm text-muted-foreground">
          {months[0].label} – {months[11].label}
        </p>
      </div>

      {/* Monthly bar chart */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Monatsumsatz</h2>
          <span className="text-sm font-medium tabular-nums text-muted-foreground">
            {fmt(totalRevenue)} gesamt
          </span>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          {/* Bar chart */}
          <div className="flex items-end gap-2" style={{ height: "120px" }}>
            {monthly.map((m) => (
              <div key={m.label} className="flex-1 flex flex-col items-center justify-end gap-1">
                <span className="text-[9px] tabular-nums text-muted-foreground hidden sm:block">
                  {m.revenue > 0
                    ? (m.revenue >= 1000 ? `${(m.revenue / 1000).toFixed(0)}k` : m.revenue.toFixed(0))
                    : ""}
                </span>
                <div
                  className="w-full rounded-sm bg-primary/60 hover:bg-primary transition-colors"
                  style={{ height: `${Math.max((m.revenue / maxRevenue) * 80, m.revenue > 0 ? 3 : 0)}px` }}
                  title={`${m.label}: ${fmt(m.revenue)} (${m.count} Deals)`}
                />
                <span className="text-[9px] text-muted-foreground">{m.shortLabel}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Closer commissions */}
      {closers.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Closer — Provisionen</h2>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Closer</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Umsatz</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Provision %</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Provision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {closers.map((c) => (
                  <tr key={c.name} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-medium">{c.name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmt(c.revenue)}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{(c.rate * 100).toFixed(0)} %</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-emerald-400">{fmt(c.commission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Sales partner commissions */}
      {partners.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Vertriebspartner — Provisionen</h2>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Partner</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Umsatz</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Provision %</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Provision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {partners.map((p) => (
                  <tr key={p.name} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-medium">{p.name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmt(p.revenue)}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{(p.rate * 100).toFixed(0)} %</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-emerald-400">{fmt(p.commission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {deals.length === 0 && (
        <div className="rounded-lg border border-border bg-muted/10 px-6 py-12 text-center text-sm text-muted-foreground">
          Noch keine Deals im ausgewählten Zeitraum.
        </div>
      )}
    </div>
  );
}

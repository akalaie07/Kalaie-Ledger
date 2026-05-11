import type { Metadata } from "next";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { de } from "date-fns/locale";

import { requireRole } from "@/lib/auth/get-current-org";
import { createClient } from "@/lib/supabase/server";
import { ViewToggle } from "./_components/view-toggle";

export const metadata: Metadata = { title: "Berichte — Buchhaltung" };

function fmt(v: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);
}

// ─── Hilfsfunktion: kurze Zahl (z.B. 12.500 → "12,5k") ──────────────────────
function fmtShort(v: number): string {
  if (v === 0) return "";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return v.toFixed(0);
}

export default async function BerichtePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view: rawView = "monthly" } = await searchParams;
  const view: "monthly" | "yearly" = rawView === "yearly" ? "yearly" : "monthly";

  const session = await requireRole("admin");
  const supabase = await createClient();

  const today = new Date();

  // ─── Perioden berechnen ────────────────────────────────────────────────────
  type Period = { label: string; shortLabel: string; from: string; to: string };

  const periods: Period[] = view === "yearly"
    ? Array.from({ length: 5 }, (_, i) => {
        const year = today.getFullYear() - (4 - i);
        return {
          label: String(year),
          shortLabel: String(year),
          from: `${year}-01-01`,
          to: `${year}-12-31`,
        };
      })
    : Array.from({ length: 12 }, (_, i) => {
        const d = subMonths(today, 11 - i);
        return {
          label: format(d, "MMM yyyy", { locale: de }),
          shortLabel: format(d, "MMM", { locale: de }),
          from: startOfMonth(d).toISOString().slice(0, 10),
          to: endOfMonth(d).toISOString().slice(0, 10),
        };
      });

  const rangeFrom = periods[0].from;
  const rangeTo = periods[periods.length - 1].to;

  // ─── Daten laden ──────────────────────────────────────────────────────────
  const [{ data: dealsAll }, { data: balancesAll }, { data: closersAll }, { data: partnersAll }] =
    await Promise.all([
      supabase
        .from("deals")
        .select("id, total_price, close_date, closer_id, sales_partner_id")
        .eq("organization_id", session.organizationId)
        .gte("close_date", rangeFrom)
        .lte("close_date", rangeTo),
      supabase
        .from("deal_balance")
        .select("deal_id, paid_sum, open_sum, overdue_sum")
        .eq("organization_id", session.organizationId),
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
  const balanceMap = new Map(
    (balancesAll ?? []).map((b) => [b.deal_id, b]),
  );
  const closerById = new Map((closersAll ?? []).map((c) => [c.id, c]));
  const partnerById = new Map((partnersAll ?? []).map((p) => [p.id, p]));

  // ─── Gesamt-KPIs ──────────────────────────────────────────────────────────
  let totalSoll = 0;
  let totalIst = 0;
  let totalOffen = 0;

  for (const d of deals) {
    const soll = Number(d.total_price) || 0;
    const balance = balanceMap.get(d.id);
    const ist = Number(balance?.paid_sum ?? 0);
    const offen = Number(balance?.open_sum ?? 0);
    totalSoll += soll;
    totalIst += ist;
    totalOffen += offen;
  }

  // ─── Perioden-Aggregation (für Balkendiagramm) ────────────────────────────
  const periodData = periods.map(({ label, shortLabel, from, to }) => {
    const inPeriod = deals.filter((d) => d.close_date >= from && d.close_date <= to);
    let soll = 0;
    let ist = 0;
    for (const d of inPeriod) {
      soll += Number(d.total_price) || 0;
      ist += Number(balanceMap.get(d.id)?.paid_sum ?? 0);
    }
    return { label, shortLabel, soll, ist, offen: Math.max(0, soll - ist), count: inPeriod.length };
  });

  const maxSoll = Math.max(...periodData.map((p) => p.soll), 1);

  // ─── Closer-Provisionen ───────────────────────────────────────────────────
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

  // ─── Partner-Provisionen ──────────────────────────────────────────────────
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

  const istPct = totalSoll > 0 ? Math.round((totalIst / totalSoll) * 100) : 0;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-8">

      {/* Header + Toggle */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Berichte</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {periods[0].label} – {periods[periods.length - 1].label}
          </p>
        </div>
        <ViewToggle view={view} />
      </div>

      {/* KPI-Karten: Soll / Ist / Offen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Soll */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Soll-Umsatz</p>
          <p className="text-2xl font-semibold tabular-nums">{fmt(totalSoll)}</p>
          <p className="text-xs text-muted-foreground">{deals.length} Deals im Zeitraum</p>
        </div>

        {/* Ist */}
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ist-Umsatz</p>
          <p className="text-2xl font-semibold tabular-nums text-emerald-400">{fmt(totalIst)}</p>
          <p className="text-xs text-muted-foreground">{istPct} % des Soll-Umsatzes erhalten</p>
        </div>

        {/* Offen */}
        <div className={[
          "rounded-lg border p-5 space-y-1",
          totalOffen > 0
            ? "border-amber-500/30 bg-amber-500/5"
            : "border-border bg-card",
        ].join(" ")}>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Offen</p>
          <p className={["text-2xl font-semibold tabular-nums", totalOffen > 0 ? "text-amber-400" : ""].join(" ")}>
            {fmt(totalOffen)}
          </p>
          <p className="text-xs text-muted-foreground">
            {totalSoll > 0 ? `${100 - istPct} % noch ausstehend` : "Keine Deals"}
          </p>
        </div>
      </div>

      {/* Balkendiagramm Soll vs Ist */}
      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold">
            {view === "yearly" ? "Jahresumsatz" : "Monatsumsatz"}
          </h2>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary/25" />
              Soll
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary" />
              Ist
            </span>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-end gap-2" style={{ height: "140px" }}>
            {periodData.map((p) => {
              const sollH = Math.max((p.soll / maxSoll) * 110, p.soll > 0 ? 3 : 0);
              const istH = p.soll > 0 ? (p.ist / p.soll) * sollH : 0;
              const offenH = Math.max(sollH - istH, 0);
              return (
                <div key={p.label} className="flex-1 flex flex-col items-center justify-end gap-1">
                  <span className="text-[9px] tabular-nums text-muted-foreground hidden sm:block">
                    {fmtShort(p.soll)}
                  </span>
                  {/* Dual-Bar: Soll (Hintergrund) mit Ist-Füllung */}
                  <div
                    className="w-full flex flex-col justify-end overflow-hidden rounded-sm"
                    style={{ height: `${sollH}px` }}
                    title={`${p.label}: Soll ${fmt(p.soll)} · Ist ${fmt(p.ist)} · Offen ${fmt(p.offen)} · ${p.count} Deals`}
                  >
                    {/* Offener Teil oben */}
                    {offenH > 0 && (
                      <div className="w-full bg-primary/20" style={{ height: `${offenH}px` }} />
                    )}
                    {/* Bezahlter Teil unten */}
                    {istH > 0 && (
                      <div className="w-full bg-primary" style={{ height: `${istH}px` }} />
                    )}
                    {/* Leerer Balken wenn keine Daten */}
                    {sollH <= 0 && (
                      <div className="w-full bg-border/30" style={{ height: "2px" }} />
                    )}
                  </div>
                  <span className="text-[9px] text-muted-foreground">{p.shortLabel}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Closer-Provisionen */}
      {closers.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Closer — Provisionen</h2>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Closer</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Soll-Umsatz</th>
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

      {/* Vertriebspartner-Provisionen */}
      {partners.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Vertriebspartner — Provisionen</h2>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Partner</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Soll-Umsatz</th>
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

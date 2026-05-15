import type { Metadata } from "next";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { de } from "date-fns/locale";

import { requireRole } from "@/lib/auth/get-current-org";
import { createClient } from "@/lib/supabase/server";
import { ViewToggle } from "@/app/(dashboard)/berichte/_components/view-toggle";

export const metadata: Metadata = { title: "Berichte — Kalaie Ledger" };

function fmt(v: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);
}

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

  const [{ data: dealsAll }, { data: balancesAll }, { data: closersAll }] =
    await Promise.all([
      supabase
        .from("deals")
        .select("id, total_price, close_date, closer_id")
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
    ]);

  const deals = dealsAll ?? [];
  const balanceMap = new Map((balancesAll ?? []).map((b) => [b.deal_id, b]));
  const closerById = new Map((closersAll ?? []).map((c) => [c.id, c]));

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

  type StaffEntry = { name: string; sollRevenue: number; istRevenue: number; sollCommission: number; istCommission: number; rate: number };
  const closerRevMap = new Map<string, StaffEntry>();
  for (const d of deals) {
    if (!d.closer_id) continue;
    const c = closerById.get(d.closer_id);
    if (!c) continue;
    const soll = Number(d.total_price) || 0;
    const ist = Number(balanceMap.get(d.id)?.paid_sum ?? 0);
    const rate = Number(c.commission_rate) || 0;
    const prev = closerRevMap.get(d.closer_id) ?? { name: c.name, sollRevenue: 0, istRevenue: 0, sollCommission: 0, istCommission: 0, rate };
    closerRevMap.set(d.closer_id, {
      name: c.name,
      sollRevenue: prev.sollRevenue + soll,
      istRevenue: prev.istRevenue + ist,
      sollCommission: prev.sollCommission + soll * rate,
      istCommission: prev.istCommission + ist * rate,
      rate,
    });
  }
  const closers = Array.from(closerRevMap.values()).sort((a, b) => b.sollRevenue - a.sollRevenue);

  const istPct = totalSoll > 0 ? Math.round((totalIst / totalSoll) * 100) : 0;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Berichte</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {periods[0].label} – {periods[periods.length - 1].label}
          </p>
        </div>
        <ViewToggle view={view} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-card p-5 space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Soll-Umsatz</p>
          <p className="text-2xl font-semibold tabular-nums">{fmt(totalSoll)}</p>
          <p className="text-xs text-muted-foreground">{deals.length} Deals im Zeitraum</p>
        </div>
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ist-Umsatz</p>
          <p className="text-2xl font-semibold tabular-nums text-emerald-400">{fmt(totalIst)}</p>
          <p className="text-xs text-muted-foreground">{istPct} % des Soll-Umsatzes erhalten</p>
        </div>
        <div className={["rounded-lg border p-5 space-y-1", totalOffen > 0 ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-card"].join(" ")}>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Offen</p>
          <p className={["text-2xl font-semibold tabular-nums", totalOffen > 0 ? "text-amber-400" : ""].join(" ")}>
            {fmt(totalOffen)}
          </p>
          <p className="text-xs text-muted-foreground">
            {totalSoll > 0 ? `${100 - istPct} % noch ausstehend` : "Keine Deals"}
          </p>
        </div>
      </div>

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
                  <div
                    className="w-full flex flex-col justify-end overflow-hidden rounded-sm"
                    style={{ height: `${sollH}px` }}
                    title={`${p.label}: Soll ${fmt(p.soll)} · Ist ${fmt(p.ist)} · Offen ${fmt(p.offen)} · ${p.count} Deals`}
                  >
                    {offenH > 0 && <div className="w-full bg-primary/20" style={{ height: `${offenH}px` }} />}
                    {istH > 0 && <div className="w-full bg-primary" style={{ height: `${istH}px` }} />}
                    {sollH <= 0 && <div className="w-full bg-border/30" style={{ height: "2px" }} />}
                  </div>
                  <span className="text-[9px] text-muted-foreground">{p.shortLabel}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {closers.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Closer — Provisionen</h2>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Closer</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Soll-Umsatz</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Ist-Umsatz</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Prov. %</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Soll-Provision</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Ist-Provision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {closers.map((c) => (
                  <tr key={c.name} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-medium">{c.name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{fmt(c.sollRevenue)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmt(c.istRevenue)}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{(c.rate * 100).toFixed(0)} %</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{fmt(c.sollCommission)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-emerald-400">{fmt(c.istCommission)}</td>
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

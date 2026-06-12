import type { Metadata } from "next";
import Link from "next/link";
import { Clock } from "lucide-react";

import { requireSession } from "@/lib/auth/get-current-org";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { CoachingDoneButton } from "./_components/coaching-done-button";

export const metadata: Metadata = { title: "Begleitung — Kalaie Ledger" };

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DealRow = any;

export default async function BegleitungPage() {
  const session = await requireSession();
  const supabase = await createClient();

  const todayIso = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const { data, error } = await supabase
    .from("deals")
    .select("id, customer_name, order_id, coaching_until, products(name), platforms(name)")
    .eq("organization_id", session.organizationId)
    .eq("coaching_done", false)
    .eq("storniert", false)
    .not("coaching_until", "is", null)
    .lte("coaching_until", horizon)
    .order("coaching_until", { ascending: true });

  const deals = (error ? [] : data ?? []) as DealRow[];

  const today = new Date(todayIso);
  function daysLeft(iso: string): number {
    const target = new Date(iso);
    return Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-amber-500/10 p-2 text-amber-400">
          <Clock className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Begleitung läuft aus</h1>
          <p className="text-sm text-muted-foreground">
            Deals, deren Begleitung in den nächsten 14 Tagen ausläuft oder bereits abgelaufen ist
          </p>
        </div>
      </div>

      {deals.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <Clock className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">Keine auslaufenden Begleitungen</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Sobald bei einem Deal „Begleitung läuft bis" gesetzt ist und das Datum näher rückt,
            erscheint er hier.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Kunde</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Produkt</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Läuft bis</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {deals.map((d) => {
                const left = daysLeft(d.coaching_until as string);
                const expired = left < 0;
                return (
                  <tr key={d.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/deals/${d.id}`}
                        className="font-medium hover:underline underline-offset-4"
                      >
                        {d.customer_name}
                      </Link>
                      {d.platforms?.name && (
                        <p className="text-xs text-muted-foreground">{d.platforms.name}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {d.products?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{fmtDate(d.coaching_until as string)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          expired
                            ? "bg-rose-500/15 text-rose-400"
                            : "bg-amber-500/15 text-amber-400",
                        )}
                      >
                        {expired
                          ? `vor ${Math.abs(left)} ${Math.abs(left) === 1 ? "Tag" : "Tagen"} abgelaufen`
                          : left === 0
                          ? "läuft heute aus"
                          : `noch ${left} ${left === 1 ? "Tag" : "Tage"}`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <CoachingDoneButton dealId={d.id as string} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { UserCheck } from "lucide-react";

import { requireSession } from "@/lib/auth/get-current-org";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Ehemalige Kunden — Kalaie Ledger" };

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DealRow = any;

export default async function EhemaligeKundenPage() {
  const session = await requireSession();
  const supabase = await createClient();

  const todayIso = new Date().toISOString().slice(0, 10);
  const today = new Date(todayIso);

  const { data, error } = await supabase
    .from("deals")
    .select("id, customer_name, order_id, coaching_until, products(name), platforms(name)")
    .eq("organization_id", session.organizationId)
    .eq("storniert", false)
    .not("coaching_until", "is", null)
    .lt("coaching_until", todayIso)
    .order("coaching_until", { ascending: false });

  const deals = (error ? [] : data ?? []) as DealRow[];

  function daysAgo(iso: string): number {
    const target = new Date(iso);
    return Math.round((today.getTime() - target.getTime()) / (24 * 60 * 60 * 1000));
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
          <UserCheck className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Ehemalige Kunden</h1>
          <p className="text-sm text-muted-foreground">
            Deals mit abgelaufener Begleitung (nicht storniert)
          </p>
        </div>
      </div>

      {deals.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <UserCheck className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">Keine ehemaligen Kunden</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Sobald bei einem Deal die Begleitung abgelaufen ist, erscheint er hier.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Kunde</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Produkt</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Begleitung abgelaufen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {deals.map((d) => {
                const ago = daysAgo(d.coaching_until as string);
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
                    <td className="px-4 py-3 tabular-nums">
                      <span className="text-muted-foreground">{fmtDate(d.coaching_until as string)}</span>
                      <span className="ml-2 text-xs text-muted-foreground/60">
                        (vor {ago} {ago === 1 ? "Tag" : "Tagen"})
                      </span>
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

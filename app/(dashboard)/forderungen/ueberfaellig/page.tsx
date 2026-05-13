import type { Metadata } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Clock } from "lucide-react";

import { requireRole } from "@/lib/auth/get-current-org";
import { createClient } from "@/lib/supabase/server";
import { ForderungsNav } from "../_components/forderungs-nav";

export const metadata: Metadata = { title: "Überfällig — Kalaie Ledger" };

function fmt(v: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);
}

export default async function UeberfaelligPage() {
  const session = await requireRole("admin");
  const supabase = await createClient();

  const { data } = await supabase
    .from("deals_with_status")
    .select("id, customer_name, total_price, close_date, open_sum, overdue_sum, computed_status, order_id, payment_type")
    .eq("organization_id", session.organizationId)
    .eq("computed_status", "overdue")
    .order("overdue_sum", { ascending: false });

  const rows = data ?? [];
  const totalOverdue = rows.reduce((s, r) => s + (Number(r.overdue_sum) || 0), 0);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-400" />
            Forderungen
          </h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} {rows.length === 1 ? "Eintrag" : "Einträge"} überfällig
          </p>
        </div>
        {rows.length > 0 && (
          <div className="text-right space-y-0.5">
            <p className="text-xs text-muted-foreground">Überfällig gesamt</p>
            <p className="text-lg font-semibold text-amber-400 tabular-nums">{fmt(totalOverdue)}</p>
          </div>
        )}
      </div>

      <ForderungsNav active="ueberfaellig" />

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Kunde</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Überfällig</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Offen</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Gesamt</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Abschluss</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <Link href={`/deals/${r.id}`} className="font-medium hover:underline underline-offset-4">
                    {r.customer_name}
                  </Link>
                  {r.order_id && (
                    <span className="ml-2 text-xs text-muted-foreground">#{r.order_id}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-amber-400 font-medium">
                  {fmt(Number(r.overdue_sum) || 0)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {fmt(Number(r.open_sum) || 0)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">
                  {fmt(Number(r.total_price) || 0)}
                </td>
                <td className="px-4 py-3 text-muted-foreground tabular-nums">
                  {format(new Date(r.close_date), "dd.MM.yyyy", { locale: de })}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                  <p className="text-sm">Keine überfälligen Zahlungen.</p>
                  <p className="text-xs mt-1 text-emerald-400">Alles im grünen Bereich! ✓</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

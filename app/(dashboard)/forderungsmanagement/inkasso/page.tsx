import type { Metadata } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { AlertTriangle } from "lucide-react";

import { requireRole } from "@/lib/auth/get-current-org";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { ForderungsNav } from "../_components/forderungs-nav";

export const metadata: Metadata = { title: "Inkasso — Buchhaltung" };

function fmt(v: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);
}

const STATUS_LABEL: Record<string, string> = {
  overdue: "Überfällig",
  in_collection: "In Inkasso",
};

const STATUS_CLASS: Record<string, string> = {
  overdue: "bg-amber-500/15 text-amber-400",
  in_collection: "bg-rose-500/15 text-rose-400",
};

export default async function InkassoSubPage() {
  const session = await requireRole("admin");
  const supabase = await createClient();

  const { data: overdue } = await supabase
    .from("deals_with_status")
    .select("id, customer_name, total_price, close_date, open_sum, overdue_sum, computed_status, order_id, payment_type")
    .eq("organization_id", session.organizationId)
    .in("computed_status", ["overdue", "in_collection"])
    .order("overdue_sum", { ascending: false });

  const rows = overdue ?? [];
  const totalOpen = rows.reduce((s, r) => s + (Number(r.open_sum) || 0), 0);
  const totalOverdue = rows.reduce((s, r) => s + (Number(r.overdue_sum) || 0), 0);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-rose-400" />
            Forderungsmanagement
          </h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} {rows.length === 1 ? "Eintrag" : "Einträge"} in Inkasso
          </p>
        </div>
        {rows.length > 0 && (
          <div className="text-right space-y-0.5">
            <p className="text-xs text-muted-foreground">Überfällig gesamt</p>
            <p className="text-lg font-semibold text-rose-400 tabular-nums">{fmt(totalOverdue)}</p>
            <p className="text-xs text-muted-foreground">Offen gesamt: {fmt(totalOpen)}</p>
          </div>
        )}
      </div>

      <ForderungsNav active="inkasso" />

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Kunde</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
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
                <td className="px-4 py-3">
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                    STATUS_CLASS[r.computed_status ?? "overdue"] ?? "bg-muted text-muted-foreground",
                  )}>
                    {STATUS_LABEL[r.computed_status ?? "overdue"] ?? r.computed_status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-rose-400 font-medium">
                  {fmt(Number(r.overdue_sum) || 0)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-amber-400">
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
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  <p className="text-sm">Keine überfälligen oder Inkasso-Deals.</p>
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

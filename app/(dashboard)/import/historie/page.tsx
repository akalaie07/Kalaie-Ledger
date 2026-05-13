import type { Metadata } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { ArrowLeft, CheckCircle, Clock, XCircle, AlertCircle } from "lucide-react";

import { requireRole } from "@/lib/auth/get-current-org";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Import-Historie — Kalaie Ledger" };

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  completed:   { label: "Abgeschlossen", color: "text-emerald-400", icon: CheckCircle },
  partial:     { label: "Teilweise",     color: "text-amber-400",   icon: AlertCircle },
  pending:     { label: "Ausstehend",    color: "text-muted-foreground", icon: Clock },
  failed:      { label: "Fehler",        color: "text-rose-400",    icon: XCircle },
  rolled_back: { label: "Rückgängig",   color: "text-muted-foreground", icon: XCircle },
};

export default async function ImportHistoriePage() {
  const session = await requireRole("admin");
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: batches } = await (supabase as any)
    .from("import_batches")
    .select("id, source, filename, row_count, created_count, paid_count, skipped_count, review_count, error_count, conflicts_count, status, created_at")
    .eq("organization_id", session.organizationId)
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = batches ?? [];

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/import" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold">Import-Historie</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} {rows.length === 1 ? "Import" : "Importe"} insgesamt
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-muted/10 px-6 py-12 text-center text-sm text-muted-foreground">
          Noch keine Importe durchgeführt.
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Datum</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Quelle / Datei</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Zeilen</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Neu</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Bezahlt</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Übersprungen</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Fehler</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {rows.map((b: any) => {
                const cfg = STATUS_CONFIG[b.status] ?? { label: b.status, color: "text-muted-foreground", icon: Clock };
                const StatusIcon = cfg.icon;
                return (
                  <tr key={b.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground tabular-nums whitespace-nowrap">
                      {format(new Date(b.created_at), "dd.MM.yyyy HH:mm", { locale: de })}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium capitalize">{b.source}</p>
                      {b.filename && (
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">{b.filename}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{b.row_count}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-400">{b.created_count || "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-blue-400">{b.paid_count || "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{b.skipped_count || "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-rose-400">{b.error_count || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <StatusIcon className={`h-3.5 w-3.5 shrink-0 ${cfg.color}`} />
                        <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                        {(b.conflicts_count ?? 0) > 0 && (
                          <Link
                            href="/import/konflikte"
                            className="ml-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400 hover:bg-amber-500/25 transition-colors"
                          >
                            {b.conflicts_count} Konflikte
                          </Link>
                        )}
                      </div>
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

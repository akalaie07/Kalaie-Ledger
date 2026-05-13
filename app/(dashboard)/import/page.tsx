import type { Metadata } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  ArrowRight,
  Upload,
  History,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  ArchiveRestore,
} from "lucide-react";

import { requireRole } from "@/lib/auth/get-current-org";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Import-Zentrale — Kalaie Ledger" };

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  completed: { label: "Abgeschlossen", color: "text-emerald-400" },
  partial:   { label: "Teilweise",     color: "text-amber-400" },
  pending:   { label: "Ausstehend",    color: "text-muted-foreground" },
  failed:    { label: "Fehler",        color: "text-rose-400" },
  rolled_back: { label: "Rückgängig", color: "text-muted-foreground" },
};

export default async function ImportZentralePage() {
  await requireRole("admin");
  const session = await requireRole("admin");
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const [{ data: batches }, { data: conflicts }] = await Promise.all([
    sb
      .from("import_batches")
      .select("id, source, filename, row_count, created_count, paid_count, skipped_count, review_count, error_count, conflicts_count, status, created_at")
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: false })
      .limit(5),
    sb
      .from("import_conflicts")
      .select("id, synthetic_key, action, reason, normalized, created_at")
      .eq("organization_id", session.organizationId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const recentBatches = batches ?? [];
  const pendingConflicts = conflicts ?? [];

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 space-y-10">

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Import-Zentrale</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Plattform-Exporte importieren, offene Konflikte klären, Verlauf einsehen.
        </p>
      </div>

      {/* ── Sektion 1: Neue Datei importieren ───────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground/70">
          Neue Datei importieren
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">

          {/* Plattform-Import */}
          <Link
            href="/import/plattform"
            className="group rounded-xl border border-border bg-card p-5 space-y-3 hover:border-foreground/30 hover:bg-muted/20 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="rounded-lg bg-blue-500/15 p-2.5">
                <Upload className="h-5 w-5 text-blue-400" />
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
            <div>
              <h3 className="text-base font-semibold">Plattform-Import</h3>
              <p className="text-sm text-muted-foreground mt-1">
                CSV-Exporte von Copecart, Digistore oder Ablefy importieren.
                Zahlungen, Erstattungen und Rückbuchungen werden automatisch erkannt.
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {["Copecart", "Digistore", "Ablefy"].map((p) => (
                <span key={p} className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                  {p}
                </span>
              ))}
            </div>
          </Link>

          {/* Legacy-Migration */}
          <Link
            href="/import/migration"
            className="group rounded-xl border border-border bg-card p-5 space-y-3 hover:border-foreground/30 hover:bg-muted/20 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="rounded-lg bg-violet-500/15 p-2.5">
                <ArchiveRestore className="h-5 w-5 text-violet-400" />
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
            <div>
              <h3 className="text-base font-semibold">Alte Buchhaltung migrieren</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Einmalige Migration aus einer bestehenden Excel-Tabelle oder
                Standard-CSV-Export.
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {["Excel (.xlsx)", "Standard-CSV", "Kalaie-Format"].map((t) => (
                <span key={t} className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                  {t}
                </span>
              ))}
            </div>
          </Link>
        </div>
      </section>

      {/* ── Sektion 2: Offene Prüfungen ─────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground/70 flex items-center gap-2">
            Offene Prüfungen
            {pendingConflicts.length > 0 && (
              <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-400">
                {pendingConflicts.length}
              </span>
            )}
          </h2>
          {pendingConflicts.length > 0 && (
            <Link href="/import/konflikte" className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors">
              Alle anzeigen →
            </Link>
          )}
        </div>

        {pendingConflicts.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/10 px-4 py-6 text-center space-y-1">
            <CheckCircle className="h-5 w-5 text-emerald-400 mx-auto" />
            <p className="text-sm text-muted-foreground">Keine offenen Konflikte.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden">
            <div className="divide-y divide-border">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {pendingConflicts.map((c: any) => {
                const normalized = c.normalized as Record<string, unknown>;
                const customerName = (normalized?.customerName as string) ?? "Unbekannt";
                const orderId = (normalized?.externalOrderId as string) ?? "—";
                return (
                  <div key={c.id} className="flex items-center justify-between px-4 py-3 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{customerName}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate">{orderId}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                      {c.reason ?? c.action}
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="px-4 py-2.5 border-t border-border bg-muted/10">
              <Link href="/import/konflikte" className="text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors">
                Alle Konflikte klären →
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* ── Sektion 3: Import-Historie ───────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground/70 flex items-center gap-2">
            <History className="h-3.5 w-3.5" />
            Import-Historie
          </h2>
          {recentBatches.length > 0 && (
            <Link href="/import/historie" className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors">
              Alle anzeigen →
            </Link>
          )}
        </div>

        {recentBatches.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/10 px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">Noch keine Importe durchgeführt.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Datum</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Quelle</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Zeilen</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Neu</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Bezahlt</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {recentBatches.map((b: any) => {
                  const cfg = STATUS_CONFIG[b.status] ?? { label: b.status, color: "text-muted-foreground" };
                  return (
                    <tr key={b.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 text-muted-foreground tabular-nums whitespace-nowrap">
                        {format(new Date(b.created_at), "dd.MM.yy HH:mm", { locale: de })}
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium capitalize">{b.source}</p>
                        {b.filename && (
                          <p className="text-xs text-muted-foreground truncate max-w-[180px]">{b.filename}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{b.row_count}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-emerald-400">{b.created_count || "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-blue-400">{b.paid_count || "—"}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {b.status === "completed" && <CheckCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
                          {b.status === "failed" && <XCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />}
                          {(b.status === "pending" || b.status === "partial") && <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
                          <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                          {(b.conflicts_count ?? 0) > 0 && (
                            <span className="ml-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                              {b.conflicts_count} Konflikte
                            </span>
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
      </section>
    </div>
  );
}

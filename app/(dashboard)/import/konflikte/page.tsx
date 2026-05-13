import type { Metadata } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { ArrowLeft, AlertCircle, ExternalLink } from "lucide-react";

import { requireRole } from "@/lib/auth/get-current-org";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Import-Konflikte — Kalaie Ledger" };

export default async function ImportKonfliктePage() {
  const session = await requireRole("admin");
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: conflicts } = await (supabase as any)
    .from("import_conflicts")
    .select("id, synthetic_key, action, reason, normalized, status, suggested_deals, created_at, batch_id")
    .eq("organization_id", session.organizationId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const rows = conflicts ?? [];

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/import" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-400" />
            Offene Konflikte
          </h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} {rows.length === 1 ? "Eintrag" : "Einträge"} warten auf manuelle Klärung
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-6 py-12 text-center space-y-1">
          <p className="text-sm font-medium text-emerald-400">Keine offenen Konflikte</p>
          <p className="text-xs text-muted-foreground">Alle Import-Einträge wurden erfolgreich verarbeitet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {rows.map((c: any) => {
            const normalized = c.normalized as Record<string, unknown>;
            const customerName = (normalized?.customerName as string) ?? "Unbekannt";
            const orderId = (normalized?.externalOrderId as string) ?? "—";
            const amount = Number(normalized?.amount ?? 0);
            const eventDate = (normalized?.eventDate as string) ?? "";
            const source = (normalized?.source as string) ?? "";
            const suggested = (c.suggested_deals as Array<{ id: string; customer_name: string }>) ?? [];

            return (
              <div
                key={c.id}
                className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="font-medium">{customerName}</p>
                      <p className="text-xs text-muted-foreground font-mono">{orderId}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {amount > 0 && (
                      <p className="text-sm font-semibold tabular-nums">
                        {new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount)}
                      </p>
                    )}
                    {eventDate && (
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(eventDate), "dd.MM.yyyy", { locale: de })}
                      </p>
                    )}
                  </div>
                </div>

                {/* Konflikt-Grund */}
                <div className="rounded-md bg-muted/30 px-3 py-2">
                  <p className="text-xs font-medium text-amber-400 mb-0.5">Grund</p>
                  <p className="text-xs text-muted-foreground">{c.reason ?? c.action}</p>
                  {source && (
                    <p className="text-[10px] text-muted-foreground/60 mt-1 capitalize">Quelle: {source}</p>
                  )}
                </div>

                {/* Vorgeschlagene Deals */}
                {suggested.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Mögliche Treffer</p>
                    <div className="flex flex-wrap gap-2">
                      {suggested.map((deal) => (
                        <Link
                          key={deal.id}
                          href={`/deals/${deal.id}`}
                          target="_blank"
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-xs hover:border-foreground/30 hover:bg-muted/30 transition-colors"
                        >
                          {deal.customer_name}
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* Aktion-Hinweis */}
                <p className="text-xs text-muted-foreground/60">
                  Um diesen Konflikt zu lösen: Deal manuell aufrufen und den Import-Eintrag zuordnen, oder den nächsten Import mit korrekter Bestell-ID durchführen.
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

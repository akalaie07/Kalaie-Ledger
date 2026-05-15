import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, AlertCircle } from "lucide-react";

import { requireRole } from "@/lib/auth/get-current-org";
import { createClient } from "@/lib/supabase/server";
import { ConflictResolveCard } from "@/app/(dashboard)/import/_components/conflict-resolve-card";

export const metadata: Metadata = { title: "Import-Konflikte — Kalaie Ledger" };

export default async function ImportKonflikteSeite() {
  const session = await requireRole("admin");
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: conflicts } = await (supabase as any)
    .from("import_conflicts")
    .select(
      "id, synthetic_key, action, reason, normalized, status, suggested_deals, created_at, batch_id",
    )
    .eq("organization_id", session.organizationId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const rows = conflicts ?? [];

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/import"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-400" />
            Offene Konflikte
          </h1>
          <p className="text-sm text-muted-foreground">
            {rows.length}{" "}
            {rows.length === 1 ? "Eintrag wartet" : "Einträge warten"} auf
            manuelle Klärung
          </p>
        </div>
      </div>

      {/* Leerzustand */}
      {rows.length === 0 ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-6 py-12 text-center space-y-1">
          <p className="text-sm font-medium text-emerald-400">
            Keine offenen Konflikte
          </p>
          <p className="text-xs text-muted-foreground">
            Alle Import-Einträge wurden erfolgreich verarbeitet.
          </p>
        </div>
      ) : (
        <>
          {/* Hinweis */}
          <div className="rounded-lg border border-border bg-muted/10 px-4 py-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">So löst du Konflikte:</p>
            <ul className="space-y-0.5 list-disc list-inside">
              <li>
                <span className="text-emerald-400 font-medium">Zuordnen</span>{" "}
                — Zahlung einem bestehenden Deal zuweisen
              </li>
              <li>
                <span className="text-blue-400 font-medium">
                  Neuen Deal anlegen
                </span>{" "}
                — Deal direkt aus den Import-Daten erstellen
              </li>
              <li>
                <span className="text-muted-foreground font-medium">
                  Überspringen
                </span>{" "}
                — Eintrag ignorieren (z.B. Duplikat oder Fehler)
              </li>
            </ul>
          </div>

          {/* Konflikt-Karten */}
          <div className="space-y-3">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {rows.map((c: any) => {
              const normalized = c.normalized as Record<string, unknown>;
              const customerName =
                (normalized?.customerName as string) ?? "Unbekannt";
              const orderId =
                (normalized?.externalOrderId as string) ?? "—";
              const amount = Number(normalized?.amount ?? 0);
              const eventDate = (normalized?.eventDate as string) ?? "";
              const source = (normalized?.source as string) ?? "";
              const suggested = (
                c.suggested_deals as Array<{
                  id: string;
                  customer_name: string;
                }>
              ) ?? [];

              return (
                <ConflictResolveCard
                  key={c.id}
                  id={c.id}
                  customerName={customerName}
                  orderId={orderId}
                  amount={amount}
                  eventDate={eventDate}
                  reason={c.reason ?? ""}
                  action={c.action ?? ""}
                  source={source}
                  suggestedDeals={suggested}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

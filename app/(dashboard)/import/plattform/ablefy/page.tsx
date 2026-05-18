import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { requireRole } from "@/lib/auth/get-current-org";
import { AblefyImportWizard } from "@/app/(dashboard)/import/_components/ablefy-import-wizard";
import { AblefyBackfillButton } from "./_components/backfill-button";

export const metadata: Metadata = { title: "Ablefy-Import — Kalaie Ledger" };

export default async function AblefyImportPage() {
  await requireRole("admin");

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/import/plattform"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold">Ablefy-Import</h1>
          <p className="text-sm text-muted-foreground">
            Historische Daten laden oder CSV manuell hochladen
          </p>
        </div>
      </div>

      {/* Automatischer Backfill */}
      <AblefyBackfillButton />

      {/* Trennlinie */}
      <div className="flex items-center gap-3">
        <div className="flex-1 border-t border-border" />
        <span className="text-xs text-muted-foreground">oder manuell per CSV</span>
        <div className="flex-1 border-t border-border" />
      </div>

      {/* Hinweis */}
      <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-300/80">
        <p className="font-medium text-cyan-300 mb-1">Ablefy CSV-Export</p>
        <p className="text-xs">
          Exportiere deine Transaktionen in Ablefy unter{" "}
          <span className="font-mono text-xs text-cyan-200">
            Statistiken → Transaktionen → Exportieren
          </span>
          . Die CSV-Datei wird mit deutschen Spaltennamen (BESTELL-ID, KAEUFER VORNAME, …)
          automatisch erkannt.
        </p>
      </div>

      <AblefyImportWizard />
    </div>
  );
}

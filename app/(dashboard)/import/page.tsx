import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/get-current-org";
import { ArrowRight, ArchiveRestore, RefreshCw } from "lucide-react";

export const metadata: Metadata = { title: "Importieren — Buchhaltung" };

export default async function ImportLandingPage() {
  await requireRole("admin");

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Import</h1>
        <p className="text-sm text-muted-foreground">
          Wähle den Import-Typ der zu deinem Anwendungsfall passt.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {/* Karte 1: Migration */}
        <Link
          href="/import/migration"
          className="group rounded-xl border border-border bg-card p-5 space-y-3 hover:border-foreground/30 hover:bg-muted/20 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="rounded-lg bg-blue-500/15 p-2.5">
              <ArchiveRestore className="h-5 w-5 text-blue-400" />
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Alte Buchhaltung importieren</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Einmalige Migration aus deiner bestehenden Excel-Tabelle (MSM BUCHHALTUNG.xlsx)
              oder einem Standard-CSV-Export. Deals, Kunden, Raten und Bestell-IDs übernehmen.
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

        {/* Karte 2: Zahlungsabgleich */}
        <Link
          href="/import/zahlungsabgleich"
          className="group rounded-xl border border-border bg-card p-5 space-y-3 hover:border-foreground/30 hover:bg-muted/20 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="rounded-lg bg-emerald-500/15 p-2.5">
              <RefreshCw className="h-5 w-5 text-emerald-400" />
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Zahlungsabgleich</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Monatlicher Abgleich von Plattform-Exporten gegen bestehende Deals.
              Zahlungen, Erstattungen, Rückbuchungen und fehlgeschlagene Zahlungen
              werden automatisch erkannt und zugeordnet.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {["Copecart", "Digistore", "Ablefy"].map((t) => (
              <span key={t} className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                {t}
              </span>
            ))}
          </div>
        </Link>
      </div>
    </div>
  );
}

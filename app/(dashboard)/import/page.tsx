import type { Metadata } from "next";
import { Upload, FileText } from "lucide-react";

import { requireRole } from "@/lib/auth/get-current-org";

export const metadata: Metadata = { title: "Importieren — Buchhaltung" };

export default async function ImportPage() {
  await requireRole("admin");

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold">CSV / XLSX Import</h1>
        <p className="text-sm text-muted-foreground">
          Deals aus einer Tabellendatei importieren
        </p>
      </div>

      <div className="rounded-lg border border-dashed border-border bg-muted/10 px-8 py-12 text-center space-y-4">
        <div className="flex justify-center">
          <div className="rounded-full bg-muted p-4">
            <Upload className="h-8 w-8 text-muted-foreground" />
          </div>
        </div>
        <div>
          <p className="font-medium">Import-Funktion</p>
          <p className="text-sm text-muted-foreground mt-1">
            Diese Funktion wird in einem nächsten Update verfügbar sein.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Erwartetes Format
        </h2>
        <p className="text-sm text-muted-foreground">
          Die Import-Datei (CSV oder XLSX) sollte folgende Spalten enthalten:
        </p>
        <div className="text-xs font-mono bg-muted/30 rounded p-3 space-y-1 text-muted-foreground">
          <p>Kunde | Bestell-ID | Produkt | Plattform | Zahlart</p>
          <p>Gesamtpreis | Zahlungsart | Abschlussdatum</p>
          <p>Closer | Vertriebspartner | Notizen</p>
        </div>
      </div>
    </div>
  );
}

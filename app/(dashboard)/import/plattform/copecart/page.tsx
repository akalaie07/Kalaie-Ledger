import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { requireRole } from "@/lib/auth/get-current-org";
import {
  CsvImportWizard,
  type PlatformConfig,
  type MappingField,
} from "@/app/(dashboard)/import/_components/csv-import-wizard";

export const metadata: Metadata = { title: "Copecart-Import — Kalaie Ledger" };

// =============================================================================
// Copecart Mapping-Felder
// Note: Copecart uses "single" name mode — one column for full customer name.
// =============================================================================

const COPECART_MAPPING_FIELDS: MappingField[] = [
  {
    key: "customerFirst",
    label: "Kundenname",
    hint: "Vollständiger Kundenname (eine Spalte)",
    required: true,
  },
  {
    key: "orderId",
    label: "Bestell-ID",
    hint: "Eindeutige Bestell-Nummer",
    required: true,
  },
  {
    key: "product",
    label: "Produkt",
    hint: "Produktname",
    required: false,
  },
  {
    key: "totalPrice",
    label: "Preis (€)",
    hint: "Bruttopreis / Bruttobetrag",
    required: true,
  },
  {
    key: "paymentType",
    label: "Zahlungsart",
    hint: "Zahlungsplan / Zahlungsart",
    required: true,
  },
  {
    key: "date",
    label: "Datum",
    hint: "Transaktionsdatum / Bestelldatum",
    required: true,
  },
];

// =============================================================================
// Platform Config
// =============================================================================

const COPECART_CONFIG: PlatformConfig = {
  platform: "copecart",
  platformLabel: "Copecart",
  accentColor: "purple",
  exportHint: "Copecart → Transaktionen → CSV-Export",
  customerNameMode: "single",
  mappingFields: COPECART_MAPPING_FIELDS,
};

// =============================================================================
// Page
// =============================================================================

export default async function CopecartImportPage() {
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
          <h1 className="text-xl font-semibold">Copecart-Import</h1>
          <p className="text-sm text-muted-foreground">
            CSV hochladen → Felder zuordnen → Prüfen → Importieren
          </p>
        </div>
      </div>

      {/* Hinweis */}
      <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 px-4 py-3 text-sm text-purple-300/80">
        <p className="font-medium text-purple-300 mb-1">Copecart CSV-Export</p>
        <p className="text-xs">
          Exportiere deine Transaktionen in Copecart unter{" "}
          <span className="font-mono text-xs text-purple-200">
            Transaktionen → CSV-Export
          </span>
          . Die CSV-Datei nutzt Komma als Trennzeichen und wird mit den Spaltennamen
          (Kundenname, Bestell-ID, Bruttopreis, …) automatisch erkannt. Es werden nur
          Zeilen mit Status{" "}
          <span className="font-mono text-xs text-purple-200">"Abgeschlossen"</span> /
          <span className="font-mono text-xs text-purple-200"> "Bezahlt"</span> importiert.
        </p>
      </div>

      <CsvImportWizard config={COPECART_CONFIG} />
    </div>
  );
}

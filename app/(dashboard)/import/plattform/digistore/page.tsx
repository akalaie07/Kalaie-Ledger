import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { requireRole } from "@/lib/auth/get-current-org";
import {
  CsvImportWizard,
  type PlatformConfig,
  type MappingField,
} from "@/app/(dashboard)/import/_components/csv-import-wizard";

export const metadata: Metadata = { title: "Digistore24-Import — Kalaie Ledger" };

// =============================================================================
// Digistore24 Mapping-Felder
// =============================================================================

const DIGISTORE_MAPPING_FIELDS: MappingField[] = [
  {
    key: "customerFirst",
    label: "Vorname",
    hint: "Kundenvorname",
    required: true,
  },
  {
    key: "customerLast",
    label: "Nachname",
    hint: "Kundennachname",
    required: false,
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
    hint: "Gesamtbetrag (gesamtbetrag / gesamtbruttobetrag)",
    required: true,
  },
  {
    key: "paymentType",
    label: "Zahlungsart",
    hint: "Abrechnungstyp / Zahlungstyp",
    required: true,
  },
  {
    key: "date",
    label: "Datum",
    hint: "Erste Zahlung am / Bestelldatum",
    required: true,
  },
];

// =============================================================================
// Platform Config
// =============================================================================

const DIGISTORE_CONFIG: PlatformConfig = {
  platform: "digistore",
  platformLabel: "Digistore24",
  accentColor: "amber",
  exportHint: "Digistore24 → Bestellungen → CSV-Export",
  customerNameMode: "split",
  mappingFields: DIGISTORE_MAPPING_FIELDS,
};

// =============================================================================
// Page
// =============================================================================

export default async function DigistoreImportPage() {
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
          <h1 className="text-xl font-semibold">Digistore24-Import</h1>
          <p className="text-sm text-muted-foreground">
            CSV hochladen → Felder zuordnen → Prüfen → Importieren
          </p>
        </div>
      </div>

      {/* Hinweis */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-300/80">
        <p className="font-medium text-amber-300 mb-1">Digistore24 CSV-Export</p>
        <p className="text-xs">
          Exportiere deine Bestellungen in Digistore24 unter{" "}
          <span className="font-mono text-xs text-amber-200">
            Bestellungen → CSV-Export
          </span>
          . Die CSV-Datei wird mit deutschen Spaltennamen (Bestell-ID, Vorname, Nachname, …)
          automatisch erkannt. Es werden nur Zeilen mit Status{" "}
          <span className="font-mono text-xs text-amber-200">"Bezahlt"</span> /
          <span className="font-mono text-xs text-amber-200"> "Abgeschlossen"</span> importiert.
        </p>
      </div>

      <CsvImportWizard config={DIGISTORE_CONFIG} />
    </div>
  );
}

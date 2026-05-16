/**
 * Platform-spezifische Auto-Detect- und Filter-Funktionen.
 *
 * Diese Datei wird CLIENT-seitig importiert (kein Server-only Code).
 * Funktionen dürfen NICHT als Props von Server → Client Components übergeben
 * werden — daher wählt CsvImportWizard die passende Funktion anhand des
 * `platform`-Strings intern aus dieser Registry.
 */

import { normHeader } from "@/app/(dashboard)/import/_components/csv-import-wizard";
import type { ColumnMap, EditableRow } from "@/app/(dashboard)/import/_components/csv-import-wizard";

// =============================================================================
// Digistore24
// =============================================================================

export function autoDetectDigistore(headers: string[]): ColumnMap {
  const norm = headers.map(normHeader);

  function find(...patterns: string[]): number {
    for (const pat of patterns) {
      const p = normHeader(pat);
      const i = norm.findIndex((h) => h === p || h.includes(p));
      if (i >= 0) return i;
    }
    return -1;
  }

  return {
    customerFirst: find("vorname", "firstname", "first name"),
    customerLast: find("nachname", "lastname", "last name"),
    orderId: find("bestell-id", "bestellnummer", "order-id", "order id"),
    product: find("produktname", "produkt", "product name", "product"),
    totalPrice: find(
      "gesamtbetrag",
      "gesamtbruttobetrag",
      "gesamtnettobetrag",
      "bruttobetrag",
      "nettobetrag",
      "ratenbetrag",
      "preis",
      "betrag",
    ),
    paymentType: find("abrechnungstyp", "zahlungstyp", "transaktionstyp"),
    date: find("erste zahlung am", "bestelldatum", "datum"),
    status: find("zahlungsstatus"),
  };
}

export function digistoreFilterPaid(row: Pick<EditableRow, "_rawStatus">): boolean {
  const s = row._rawStatus.toLowerCase().trim();
  // Digistore liefert Snapshot-Daten. Alle Zeilen mit einem echten Transaktionsstatus
  // anzeigen — der Nutzer kann irrelevante Zeilen im Edit-Schritt manuell entfernen.
  //
  // Eingeschlossen:
  //   "Vollständig bezahlt"    → abgeschlossene Einmalzahlung / Raten
  //   "Zahlungen aktiv"        → laufendes Abo oder Ratenmodell
  //   "Zahlungen abgebrochen"  → storniert/Rückgabe — war in Buchhaltung relevant
  //   "Mahnungen abgebrochen"  → Forderungsausfall, Chargeback
  //   "Abgeschlossen" etc.     → generische Abschlüsse
  //
  // Ausgeschlossen: leere oder unbekannte Zeilen ohne erkennbaren Status.
  return s.length > 0;
}

// =============================================================================
// Copecart
// =============================================================================

export function autoDetectCopecart(headers: string[]): ColumnMap {
  const norm = headers.map(normHeader);

  function find(...patterns: string[]): number {
    for (const pat of patterns) {
      const p = normHeader(pat);
      const i = norm.findIndex((h) => h === p || h.includes(p));
      if (i >= 0) return i;
    }
    return -1;
  }

  return {
    // "single" mode: full name in customerFirst, customerLast unused
    customerFirst: find("kundenname", "name", "kunde"),
    customerLast: -1,
    orderId: find("bestell-id", "bestellnummer", "order id", "order-id"),
    product: find("produktname", "produkt", "product name", "product"),
    totalPrice: find("bruttopreis", "bruttobetrag", "betrag", "brutto"),
    paymentType: find("zahlungsplan", "zahlungsart"),
    date: find("transaktionsdatum", "bestelldatum", "datum", "erstellt am"),
    status: find("status"),
  };
}

export function copecartFilterPaid(row: Pick<EditableRow, "_rawStatus">): boolean {
  const s = row._rawStatus.toLowerCase();
  return (
    s === "abgeschlossen" ||
    s === "completed" ||
    s === "bezahlt" ||
    s.includes("bezahlt") ||
    s.includes("erfolgreich") ||
    s.includes("paid") ||
    s.includes("complete")
  );
}

// =============================================================================
// Registry — vom CsvImportWizard genutzt
// =============================================================================

export const PLATFORM_AUTO_DETECT: Record<string, (headers: string[]) => ColumnMap> = {
  digistore: autoDetectDigistore,
  copecart: autoDetectCopecart,
};

export const PLATFORM_FILTER_PAID: Record<
  string,
  (row: Pick<EditableRow, "_rawStatus">) => boolean
> = {
  digistore: digistoreFilterPaid,
  copecart: copecartFilterPaid,
};

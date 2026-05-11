import { parseGermanPrice, parseDate, buildSyntheticKey, today } from "./shared";
import type { NormalizedImportRow } from "../types";

// =============================================================================
// Legacy-XLSX Adapter (Kalaie Spalten-Format)
//
// Dieses Format dient nur der Migration/Bootstrap-Einspielung von historischen
// Daten. Es darf KEINE bestehenden Plattformdaten überschreiben.
//
// Struktur (eine Zeile = ein Label, Spalten 1+ = Kunden):
//   Zeile 1:  Labels (Zeilentitel)
//   Zeile 2:  Kundenname
//   Zeile 3:  Freitext: Plan / Plattform / Produkt
//   Zeile 4:  Bestell-ID
//   Zeilen 5–24: Historisch bezahlte Raten (Betrag oder leer)
//   Zeile 26: Summe aller Zahlungen
//   Zeile 28: Preispaket (Gesamt-Vertragspreise)
//   Zeile 30: Differenz (ausstehend)
// =============================================================================

function detectPlatform(desc: string): string {
  const d = desc.toLowerCase();
  if (d.includes("copecart") || d.includes("cope")) return "Copecart";
  if (d.includes("digistore")) return "Digistore";
  if (d.includes("ablefy") || d.includes("ablify")) return "Ablefy";
  return "";
}

function normLabel(val: unknown): string {
  return String(val ?? "")
    .trim()
    .toLowerCase()
    .replace(/:$/, "")
    .replace(/\s+/g, " ");
}

/**
 * Parst das Kalaie Legacy-XLSX Spalten-Format.
 *
 * @param rawRows - Rohdaten aus XLSX.utils.sheet_to_json (header: 1, defval: "")
 *                  Eine Zeile = Array [Label, Wert1, Wert2, ...]
 */
export function parseLegacyXlsxImport(rawRows: unknown[][]): NormalizedImportRow[] {
  if (rawRows.length < 5) return [];

  // Label-basierte Row-Map für flexible Zeilen-Suche
  const rowByLabel = new Map<string, unknown[]>();
  for (const row of rawRows) {
    const label = normLabel(row[0]);
    if (label) rowByLabel.set(label, row.slice(1));
  }

  const getRow = (index: number): unknown[] => (rawRows[index] ?? []).slice(1);

  // Zeile 2 (Index 1) = Kundennamen
  const customerRow = getRow(1);
  // Zeile 3 (Index 2) = Freitext
  const descRow = getRow(2);
  // Zeile 4 (Index 3) = Bestell-IDs
  const orderIdRow = getRow(3);

  // Zeilen 5–24 (Index 4–23) = bezahlte Raten
  const rateRows: unknown[][] = [];
  for (let r = 4; r <= 23; r++) {
    rateRows.push(getRow(r));
  }

  // Zeile 28 (Index 27) = Preispaket — auch über Label suchbar
  const priceRow =
    rowByLabel.get("preispaket") ??
    rowByLabel.get("gesamtpaket") ??
    rowByLabel.get("gesamtpreis") ??
    rowByLabel.get("preis") ??
    getRow(27);

  if (!priceRow || priceRow.every((v) => !String(v ?? "").trim())) return [];

  const numCols = Math.max(customerRow.length, orderIdRow.length, priceRow.length);
  const result: NormalizedImportRow[] = [];
  const eventDate = today();

  for (let col = 0; col < numCols; col++) {
    const customerName = String(customerRow[col] ?? "").trim();
    if (!customerName) continue;

    const totalPrice = parseGermanPrice(priceRow[col]);
    if (!totalPrice || totalPrice <= 0) continue;

    const desc = String(descRow[col] ?? "").trim();
    const orderId = String(orderIdRow[col] ?? "").trim();
    const platform = detectPlatform(desc);

    // Alle ausgefüllten Raten-Zellen dieser Spalte
    const paidRates: { seq: number; amount: number }[] = [];
    for (let r = 0; r < rateRows.length; r++) {
      const val = parseGermanPrice(rateRows[r][col]);
      if (val !== null && val > 0) {
        paidRates.push({ seq: r + 1, amount: val });
      }
    }

    // Datum aus Beschreibung extrahieren falls vorhanden
    const dateMatch = desc.match(/\d{1,2}[./]\d{1,2}[./]\d{4}/);
    const parsedDate = dateMatch ? (parseDate(dateMatch[0]) ?? eventDate) : eventDate;

    const warnings = [
      "Dieser Import ist nur für Migration/Bootstrap — überschreibt keine Plattformdaten.",
    ];
    if (!orderId) {
      warnings.push("Keine Bestell-ID in der Datei — Abgleich nur über Kundenname möglich.");
    }

    // Stabiler Fallback-Key wenn keine Bestell-ID
    const orderKey = orderId || `legacy-${customerName.toLowerCase().replace(/\s+/g, "-")}`;

    if (paidRates.length > 1) {
      // Ratenzahlung: eine normalisierte Row pro bezahlter Rate
      for (const rate of paidRates) {
        result.push({
          source: "legacy_xlsx",
          rowNumber: col + 2,
          externalOrderId: orderKey,
          externalTransactionId: null,
          externalInstallmentId: null,
          syntheticKey: buildSyntheticKey(["legacy", orderKey, String(rate.seq)]),
          customerName,
          customerEmail: null,
          productRawName: desc || null,
          platformRawName: platform || null,
          planType: "installments",
          eventType: "payment_paid",
          amount: rate.amount,
          currency: "EUR",
          eventDate: parsedDate,
          dueDate: null,
          installmentSequence: rate.seq,
          rawData: {
            desc,
            orderId,
            totalPrice: String(totalPrice),
            rateSeq: String(rate.seq),
          },
          warnings,
        });
      }
    } else {
      // Einmalzahlung oder keine bezahlten Raten erkannt
      result.push({
        source: "legacy_xlsx",
        rowNumber: col + 2,
        externalOrderId: orderKey,
        externalTransactionId: null,
        externalInstallmentId: null,
        syntheticKey: buildSyntheticKey(["legacy", orderKey, "1"]),
        customerName,
        customerEmail: null,
        productRawName: desc || null,
        platformRawName: platform || null,
        planType: "one_time",
        eventType: paidRates.length > 0 ? "payment_paid" : "payment_pending",
        amount: paidRates[0]?.amount ?? totalPrice,
        currency: "EUR",
        eventDate: parsedDate,
        dueDate: null,
        installmentSequence: null,
        rawData: {
          desc,
          orderId,
          totalPrice: String(totalPrice),
        },
        warnings,
      });
    }
  }

  return result;
}

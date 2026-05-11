import {
  parseLine,
  lc,
  parseGermanPrice,
  parseDate,
  buildSyntheticKey,
  findColIdx,
  today,
} from "./shared";
import type { NormalizedImportRow, NormalizedEventType, NormalizedPlanType } from "../types";

// =============================================================================
// Digistore Status-Mapping
//
// Digistore liefert einen Order/Snapshot-Export, KEINE Einzel-Transaktionen.
// Eine Zeile = aktueller Zustand einer Bestellung.
// =============================================================================

type StatusInfo = {
  eventType: NormalizedEventType;
  warnings: string[];
  needsReview: boolean;
};

function mapZahlungsstatus(zahlungsstatus: string, abrechnungstyp: string): StatusInfo {
  const s = lc(zahlungsstatus);
  const warnings: string[] = [];

  // "Vollständig bezahlt" → sicher abgeschlossen
  if (
    s.includes("vollständig bezahlt") ||
    s.includes("vollstaendig bezahlt") ||
    s === "abgeschlossen"
  ) {
    return { eventType: "payment_paid", warnings: [], needsReview: false };
  }

  // "Zahlungen aktiv" → laufendes Abo/Ratenmodell, Raten nicht eindeutig
  if (s === "zahlungen aktiv" || s === "aktiv") {
    warnings.push(
      `Laufendes Abo/Ratenmodell (Status: "${zahlungsstatus}") — ` +
        `individuelle Raten können nicht sicher zugeordnet werden.`,
    );
    return { eventType: "payment_paid", warnings, needsReview: true };
  }

  // "Zahlungen abgebrochen" → je nach Typ Rückgabe oder Abbruch
  if (s.includes("zahlungen abgebrochen") || s === "abgebrochen") {
    const typ = lc(abrechnungstyp);
    if (typ.includes("rückgabe") || typ.includes("rueckgabe") || typ.includes("refund")) {
      return { eventType: "refund", warnings: [], needsReview: false };
    }
    warnings.push(`Zahlungen abgebrochen, Typ unklar: "${abrechnungstyp}" — bitte prüfen.`);
    return { eventType: "payment_failed", warnings, needsReview: true };
  }

  // "Mahnungen abgebrochen" → Forderungsausfall, needs_review
  if (s.includes("mahnungen abgebrochen")) {
    warnings.push("Mahnungen abgebrochen — wahrscheinlich Forderungsausfall.");
    return { eventType: "payment_failed", warnings, needsReview: true };
  }

  // "Rücklastschrift" → Chargeback
  if (
    s.includes("rücklastschrift") ||
    s.includes("ruecklastschrift") ||
    s.includes("chargeback")
  ) {
    warnings.push("Rücklastschrift — manuelle Prüfung und Nachverfolgung erforderlich.");
    return { eventType: "chargeback", warnings, needsReview: true };
  }

  // Explizite Erstattung
  if (s.includes("erstattet") || s.includes("refund") || s.includes("rückgabe")) {
    return { eventType: "refund", warnings: [], needsReview: false };
  }

  warnings.push(`Unbekannter Zahlungsstatus: "${zahlungsstatus}"`);
  return { eventType: "unknown", warnings, needsReview: true };
}

// =============================================================================
// Haupt-Parser
// =============================================================================

/**
 * Parst einen Digistore-CSV-Export in normalisierte Import-Rows.
 *
 * Wichtige Regeln:
 * - Dies ist ein ORDER/SNAPSHOT-Export, keine Transaktionsliste.
 * - Eine Zeile = aktueller Gesamtzustand einer Bestellung.
 * - "Vollständig bezahlt" + "Zahlung" → sicher paid (hohe Confidence).
 * - "Zahlungen aktiv" → warning, laufendes Modell, Raten nicht eindeutig.
 * - "Zahlungen abgebrochen" + "Rückgabe" → refund.
 * - "Mahnungen abgebrochen" / "Rücklastschrift" → failed/chargeback/needs_review.
 * - Einzelne Raten-Sequenz wird NICHT gesetzt (kein Transaktions-Export).
 */
export function parseDigistoreExport(text: string): NormalizedImportRow[] {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseLine(lines[0], ";");
  if (!headers.length) return [];

  const idxId = findColIdx(headers, "bestell-id", "bestellnummer", "order-id");
  if (idxId < 0) return [];

  const idxZStatus = findColIdx(headers, "zahlungsstatus");
  const idxAbrTyp = findColIdx(headers, "abrechnungstyp", "zahlungstyp", "transaktionstyp");
  const idxVorname = findColIdx(headers, "vorname", "firstname");
  const idxNachname = findColIdx(headers, "nachname", "lastname");
  const idxEmail = findColIdx(headers, "e-mail", "email");
  const idxProduct = findColIdx(headers, "produktname", "produkt");
  // Einzelbetrag (eine Rate oder Einmalzahlung)
  const idxPrice = findColIdx(
    headers,
    "erste zahlung",
    "ratenbetrag",
    "nettobetrag",
    "bruttobetrag",
    "preis",
  );
  // Gesamtbetrag
  const idxTotal = findColIdx(
    headers,
    "gesamtbetrag",
    "gesamtnettobetrag",
    "gesamtbruttobetrag",
  );
  const idxDate = findColIdx(headers, "erste zahlung am", "bestelldatum", "datum");
  const idxTotalRates = findColIdx(headers, "anzahl zahlungen", "raten", "laufzeit");
  const idxCurrency = findColIdx(headers, "währung", "waehrung");

  const result: NormalizedImportRow[] = [];

  for (let rowIdx = 1; rowIdx < lines.length; rowIdx++) {
    const cols = parseLine(lines[rowIdx], ";");
    const get = (i: number) => (i >= 0 ? (cols[i]?.trim() ?? "") : "");

    const orderId = get(idxId);
    if (!orderId) continue;

    const rawZStatus = get(idxZStatus);
    const rawAbrTyp = get(idxAbrTyp);
    const { eventType, warnings: statusWarnings, needsReview } = mapZahlungsstatus(
      rawZStatus,
      rawAbrTyp,
    );

    const vorname = get(idxVorname);
    const nachname = get(idxNachname);
    const customerName = [vorname, nachname].filter(Boolean).join(" ") || "Unbekannt";
    const customerEmail = get(idxEmail) || null;
    const productRawName = get(idxProduct) || null;

    // Gesamtbetrag bevorzugen, Einzelbetrag als Fallback
    const rawTotal = get(idxTotal);
    const rawPrice = get(idxPrice);
    const amount = parseGermanPrice(rawTotal || rawPrice) ?? 0;

    const rawDate = get(idxDate);
    const eventDate = parseDate(rawDate) ?? today();
    const currency = get(idxCurrency) || "EUR";

    // Zahlungsplan aus Abrechnungstyp ableiten
    const planNorm = lc(rawAbrTyp);
    let planType: NormalizedPlanType = "unknown";
    if (planNorm.includes("einmal") || planNorm.includes("one_time") || planNorm.includes("single")) {
      planType = "one_time";
    } else if (planNorm.includes("rate") || planNorm.includes("teilzahl")) {
      planType = "installments";
    } else if (
      planNorm.includes("abo") ||
      planNorm.includes("subscription") ||
      planNorm.includes("wiederkehr")
    ) {
      planType = "subscription";
    }

    const rawTotalRates = get(idxTotalRates);
    const _totalRates = parseInt(rawTotalRates, 10); // für zukünftige Nutzung

    const warnings = [...statusWarnings];
    if (needsReview) {
      warnings.push("Manuelle Prüfung empfohlen.");
    }
    if (planType === "unknown" && rawAbrTyp) {
      warnings.push(`Abrechnungstyp nicht erkannt: "${rawAbrTyp}"`);
    }

    const rawData: Record<string, string> = {};
    headers.forEach((h, i) => {
      rawData[h] = cols[i]?.trim() ?? "";
    });

    // syntheticKey: Snapshot-Export → orderId:zahlungsstatus (kein Transaktions-ID)
    const syntheticKey = buildSyntheticKey(["digistore", orderId, lc(rawZStatus)]);

    result.push({
      source: "digistore",
      rowNumber: rowIdx + 1,
      externalOrderId: orderId,
      externalTransactionId: null,
      externalInstallmentId: null,
      syntheticKey,
      customerName,
      customerEmail,
      productRawName,
      platformRawName: "Digistore",
      planType,
      eventType,
      amount,
      currency,
      eventDate,
      dueDate: null,
      // Digistore ist Snapshot — keine einzelnen Raten-Sequenzen
      installmentSequence: null,
      rawData,
      warnings,
    });
  }

  return result;
}

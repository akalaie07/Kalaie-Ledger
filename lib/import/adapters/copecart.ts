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
// Copecart Status-Mapping
// =============================================================================

function mapStatus(rawStatus: string): NormalizedEventType {
  const s = lc(rawStatus);
  if (s === "bezahlt") return "payment_paid";
  if (s === "ausstehend") return "payment_pending";
  if (s === "fehlgeschlagen") return "payment_failed";
  if (s === "erfolgreich erstattet" || s === "erstattet") return "refund";
  if (s === "rückbuchung erfolgreich" || s === "rueckbuchung erfolgreich") return "chargeback";
  if (
    s === "stornierung der rückbuchung" ||
    s === "stornierung der rueckbuchung" ||
    s === "chargeback storniert"
  )
    return "chargeback_reversal";
  return "unknown";
}

type PlanInfo = {
  planType: NormalizedPlanType;
  isSubscription: boolean;
};

function mapPlan(rawPlan: string): PlanInfo {
  const p = lc(rawPlan);
  if (p.includes("abonnement") || p.includes("abo") || p.includes("subscription")) {
    return { planType: "subscription", isSubscription: true };
  }
  if (p.includes("rate") || p.includes("teilzahl") || p.includes("raten")) {
    return { planType: "installments", isSubscription: false };
  }
  if (p.includes("einmal")) {
    return { planType: "one_time", isSubscription: false };
  }
  return { planType: "unknown", isSubscription: false };
}

// =============================================================================
// Haupt-Parser
// =============================================================================

/**
 * Parst einen Copecart-CSV-Export in normalisierte Import-Rows.
 *
 * Wichtige Regeln:
 * - syntheticKey = platform:orderId:rateNr:date:nettoPreis:status
 * - Bei Zahlungsplan "Abonnement": "Anzahl der Rate" wird NICHT als
 *   installment_sequence behandelt (Abo-Zahlungsnummern sind keine Raten).
 */
export function parseCopecartExport(text: string): NormalizedImportRow[] {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseLine(lines[0], ",");

  const idxId = findColIdx(headers, "bestell-id", "bestellnummer", "order id", "order-id");
  const idxStatus = findColIdx(headers, "status");
  if (idxId < 0 || idxStatus < 0) return [];

  const idxTrx = findColIdx(
    headers,
    "transaktions-id",
    "transaktionsnummer",
    "trx-id",
    "transaktionsid",
  );
  const idxKunde = findColIdx(headers, "kundenname", "name", "kunde");
  const idxEmail = findColIdx(headers, "e-mail", "email", "e-mail-adresse");
  const idxNettoPrice = findColIdx(headers, "nettopreis", "netto", "nettobetrag");
  const idxBruttoPrice = findColIdx(headers, "bruttopreis", "brutto", "bruttobetrag", "betrag");
  const idxProduct = findColIdx(headers, "produktname", "produkt");
  // "Anzahl der Rate" = Raten-Nummer dieser Transaktion
  const idxRateNr = findColIdx(
    headers,
    "anzahl der rate",
    "rate nr.",
    "ratennummer",
    "rate nr",
  );
  const idxDate = findColIdx(
    headers,
    "transaktionsdatum",
    "bestelldatum",
    "datum",
    "erstellt am",
  );
  const idxPlan = findColIdx(headers, "zahlungsplan", "zahlungsart");
  const idxTotalRates = findColIdx(
    headers,
    "gesamtrate",
    "raten gesamt",
    "anzahl raten",
    "gesamtraten",
  );
  const idxCurrency = findColIdx(headers, "währung", "waehrung", "currency");

  const result: NormalizedImportRow[] = [];

  for (let rowIdx = 1; rowIdx < lines.length; rowIdx++) {
    const cols = parseLine(lines[rowIdx], ",");
    const get = (i: number) => (i >= 0 ? (cols[i]?.trim() ?? "") : "");

    const orderId = get(idxId);
    if (!orderId) continue;

    const rawStatus = get(idxStatus);
    const eventType = mapStatus(rawStatus);

    const rawPlan = get(idxPlan);
    const { planType, isSubscription } = mapPlan(rawPlan);

    const rawRateNr = get(idxRateNr);
    const rateNr = parseInt(rawRateNr, 10);

    // Abonnement: Laufende Abrechnungsnummer ≠ Raten-Sequenz im Buchungssystem
    const installmentSequence =
      !isSubscription && !isNaN(rateNr) && rateNr > 0 ? rateNr : null;

    const rawDate = get(idxDate);
    const eventDate = parseDate(rawDate) ?? today();

    // Nettopreis bevorzugen (ohne MwSt), Brutto als Fallback
    const rawPrice = get(idxNettoPrice) || get(idxBruttoPrice);
    const amount = parseGermanPrice(rawPrice) ?? 0;

    const currency = get(idxCurrency) || "EUR";
    const trxId = get(idxTrx) || null;
    const customerName = get(idxKunde) || "Unbekannt";
    const customerEmail = get(idxEmail) || null;
    const productRawName = get(idxProduct) || null;

    // Gesamtanzahl Raten (für Deal-Erstellung)
    const rawTotalRates = get(idxTotalRates);
    const _totalRates = parseInt(rawTotalRates, 10);

    const warnings: string[] = [];
    if (eventType === "unknown") {
      warnings.push(`Unbekannter Status: "${rawStatus}"`);
    }
    if (planType === "unknown" && rawPlan) {
      warnings.push(`Unbekannter Zahlungsplan: "${rawPlan}"`);
    }
    if (isSubscription && !isNaN(rateNr) && rateNr > 0) {
      warnings.push(
        `Abonnement: "Anzahl der Rate" (${rateNr}) wird nicht als Raten-Sequenz im Buchungssystem gewertet.`,
      );
    }
    if (amount === 0) {
      warnings.push("Betrag ist 0 — bitte prüfen.");
    }

    const rawData: Record<string, string> = {};
    headers.forEach((h, i) => {
      rawData[h] = cols[i]?.trim() ?? "";
    });

    // syntheticKey: platform:orderId:rateNr:date:nettoPreis:status
    const syntheticKey = buildSyntheticKey([
      "copecart",
      orderId,
      rawRateNr || "0",
      eventDate,
      rawPrice || "0",
      lc(rawStatus),
    ]);

    result.push({
      source: "copecart",
      rowNumber: rowIdx + 1,
      externalOrderId: orderId,
      externalTransactionId: trxId,
      externalInstallmentId: null,
      syntheticKey,
      customerName,
      customerEmail,
      productRawName,
      platformRawName: "Copecart",
      planType,
      eventType,
      amount,
      currency,
      eventDate,
      dueDate: null,
      installmentSequence,
      rawData,
      warnings,
    });
  }

  return result;
}

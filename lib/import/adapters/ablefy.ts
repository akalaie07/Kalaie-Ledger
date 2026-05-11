import {
  parseLine,
  lc,
  parseGermanPrice,
  parseDate,
  buildSyntheticKey,
  normUmlauts,
  today,
} from "./shared";
import type { NormalizedImportRow, NormalizedEventType, NormalizedPlanType } from "../types";

// =============================================================================
// Ablefy Event-Typ Mapping (TYP-Spalte hat Vorrang vor STATUS)
// =============================================================================

function mapTyp(rawTyp: string): NormalizedEventType {
  const t = lc(rawTyp);
  if (t === "zahlungseingang" || (t.includes("zahlung") && t.includes("eingang")))
    return "payment_paid";
  if (t === "rueckbuchung" || t === "rückbuchung") return "chargeback";
  if (t.includes("erstattet") || t.includes("storno") || t.includes("storniert"))
    return "refund";
  if (t.includes("fehlgeschlagen") || t.includes("abgelehnt")) return "payment_failed";
  return "unknown";
}

function mapStatusFallback(rawStatus: string): NormalizedEventType {
  const s = lc(rawStatus);
  if (s.includes("erfolgreich") || s.includes("bezahlt") || s.includes("abgeschlossen"))
    return "payment_paid";
  if (s.includes("erstattet") || s.includes("rückgabe") || s.includes("storniert"))
    return "refund";
  if (s.includes("fehlgeschlagen") || s.includes("abgelehnt")) return "payment_failed";
  return "unknown";
}

type PlanInfo = {
  planType: NormalizedPlanType;
  totalInstallments: number | null;
};

function mapPlan(rawPlan: string): PlanInfo {
  const p = lc(rawPlan);
  if (p.includes("rate") || p.includes("teilzahl")) {
    const match = rawPlan.match(/(\d+)/);
    return {
      planType: "installments",
      totalInstallments: match ? parseInt(match[1], 10) : null,
    };
  }
  if (p.includes("abo") || p.includes("subscription")) {
    const match = rawPlan.match(/(\d+)/);
    return {
      planType: "subscription",
      totalInstallments: match ? parseInt(match[1], 10) : null,
    };
  }
  if (p.includes("einmal") || p.includes("einzahlung") || p.includes("one")) {
    return { planType: "one_time", totalInstallments: null };
  }
  return { planType: "unknown", totalInstallments: null };
}

// =============================================================================
// Haupt-Parser
// =============================================================================

/**
 * Parst einen Ablefy-CSV-Export in normalisierte Import-Rows.
 *
 * Wichtige Regeln:
 * - TRX-ID → externalTransactionId
 * - BESTELL-ID → externalOrderId
 * - FÄLLIGKEITEN ID → externalInstallmentId (Ablefy-interne Rate-ID)
 * - TYP-Spalte hat Vorrang vor STATUS für Event-Klassifikation
 * - PLAN ist verlässlicher als ZAHLUNGSPLAN
 * - BEZAHLT = tatsächlich bezahlter Betrag
 * - FÄLLIGER BETRAG = Gesamt-/Fälligkeitsbetrag (als total_price verwendbar)
 * - Raten-Sequenz wird post-hoc nach Datum sortiert und zugewiesen
 */
export function parseAblefyExport(text: string): NormalizedImportRow[] {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseLine(lines[0], ";");
  // Ablefy kodiert Umlaute manchmal als ae/oe/ue in Header-Namen
  const normHeaders = headers.map(normUmlauts);

  const findIdx = (...names: string[]): number => {
    for (const name of names) {
      const norm = normUmlauts(name);
      const i = normHeaders.findIndex((h) => h === norm || h.includes(norm));
      if (i >= 0) return i;
    }
    return -1;
  };

  const idxTrx = findIdx("trx-id", "transaktions-id", "transaktionsnummer");
  const idxId = findIdx("bestell-id", "bestellnummer");
  if (idxId < 0) return [];

  // FÄLLIGKEITEN ID = interne Ablefy-ID für eine einzelne Rate
  const idxInstallmentId = findIdx(
    "faelligkeiten id",
    "fälligkeiten id",
    "faelligkeit id",
    "fälligkeit id",
    "rate id",
  );

  const idxTyp = findIdx("typ");
  const idxStatus = findIdx("status");

  // Käufer-Felder — Ablefy schreibt "KAEUFER VORNAME" etc.
  const idxVorname = normHeaders.findIndex(
    (h) => (h.includes("kaeufer") || h.includes("kaeuferin")) && h.includes("vorname"),
  );
  const idxNachname = normHeaders.findIndex(
    (h) => (h.includes("kaeufer") || h.includes("kaeuferin")) && h.includes("nachname"),
  );
  const idxEmail = findIdx("e-mail", "email", "kaeufer email", "kaeuferin email");
  const idxProduct = findIdx("produktname", "produkt");

  // BEZAHLT = tatsächlich gebuchter Betrag
  const idxBezahlt = findIdx("bezahlt");
  // FÄLLIGER BETRAG = Gesamt-/Fälligkeitsbetrag
  const idxFaelligerBetrag = findIdx(
    "faelliger betrag",
    "fälliger betrag",
    "faelliger betrag",
    "gesamtbetrag",
  );

  const idxDate = findIdx(
    "datum",
    "erstellt am",
    "transaktionsdatum",
    "zahlungsdatum",
    "erstellt",
  );

  // PLAN hat Vorrang vor ZAHLUNGSPLAN
  const idxPlan = findIdx("plan");
  const idxZahlungsplan = findIdx("zahlungsplan", "zahlungstyp");
  const idxCurrency = findIdx("währung", "waehrung", "currency");

  const result: NormalizedImportRow[] = [];

  for (let rowIdx = 1; rowIdx < lines.length; rowIdx++) {
    const cols = parseLine(lines[rowIdx], ";");
    const get = (i: number) => (i >= 0 ? (cols[i]?.trim() ?? "") : "");

    const orderId = get(idxId);
    if (!orderId) continue;

    const trxId = get(idxTrx) || null;
    const installmentIdRaw = get(idxInstallmentId);
    const externalInstallmentId = installmentIdRaw || null;

    // TYP-Spalte zuerst, dann STATUS als Fallback
    const rawTyp = get(idxTyp);
    const rawStatus = get(idxStatus);
    let eventType: NormalizedEventType;
    if (rawTyp) {
      eventType = mapTyp(rawTyp);
      if (eventType === "unknown") {
        eventType = mapStatusFallback(rawStatus);
      }
    } else {
      eventType = mapStatusFallback(rawStatus);
    }

    const vorname = get(idxVorname);
    const nachname = get(idxNachname);
    const customerName = [vorname, nachname].filter(Boolean).join(" ") || "Unbekannt";
    const customerEmail = get(idxEmail) || null;
    const productRawName = get(idxProduct) || null;

    // BEZAHLT = tatsächlich gebuchter Betrag für diese Transaktion
    const rawBezahlt = get(idxBezahlt);
    const amount = parseGermanPrice(rawBezahlt) ?? 0;

    // FÄLLIGER BETRAG = verwendbar als total_price
    const rawFaelligerBetrag = get(idxFaelligerBetrag);
    const dueAmount = parseGermanPrice(rawFaelligerBetrag);

    const rawDate = get(idxDate);
    const eventDate = parseDate(rawDate) ?? today();
    const currency = get(idxCurrency) || "EUR";

    // PLAN ist verlässlicher als ZAHLUNGSPLAN
    const planRaw = idxPlan >= 0 ? get(idxPlan) : get(idxZahlungsplan);
    const { planType } = mapPlan(planRaw);

    const warnings: string[] = [];
    if (eventType === "unknown") {
      warnings.push(`Unbekannter Event-Typ: TYP="${rawTyp}" STATUS="${rawStatus}"`);
    }
    if (planType === "unknown" && planRaw) {
      warnings.push(`Unbekannter Zahlungsplan: "${planRaw}"`);
    }
    if (amount === 0 && dueAmount !== null && dueAmount > 0) {
      warnings.push(
        `BEZAHLT ist 0, FÄLLIGER BETRAG = ${dueAmount} — Transaktion möglicherweise noch nicht gebucht.`,
      );
    }

    const rawData: Record<string, string> = {};
    headers.forEach((h, i) => {
      rawData[h] = cols[i]?.trim() ?? "";
    });

    // syntheticKey: TRX-ID ist am eindeutigsten; Fallback auf orderId:installmentId
    const syntheticKey = buildSyntheticKey([
      "ablefy",
      trxId || orderId,
      externalInstallmentId || "",
    ]);

    result.push({
      source: "ablefy",
      rowNumber: rowIdx + 1,
      externalOrderId: orderId,
      externalTransactionId: trxId,
      externalInstallmentId,
      syntheticKey,
      customerName,
      customerEmail,
      productRawName,
      platformRawName: "Ablefy",
      planType,
      eventType,
      amount,
      currency,
      eventDate,
      dueDate: null,
      // Wird post-hoc zugewiesen (nach Datum sortiert)
      installmentSequence: null,
      rawData,
      warnings,
    });
  }

  // Post-Processing: Raten-Sequenz für Raten-Pläne nach Datum zuweisen.
  // Alle bezahlten Raten pro Order werden aufsteigend nach eventDate nummeriert.
  const installmentOrders = new Map<string, NormalizedImportRow[]>();
  for (const row of result) {
    if (row.planType === "installments" && row.eventType === "payment_paid") {
      if (!installmentOrders.has(row.externalOrderId)) {
        installmentOrders.set(row.externalOrderId, []);
      }
      installmentOrders.get(row.externalOrderId)!.push(row);
    }
  }
  for (const rows of installmentOrders.values()) {
    rows.sort((a, b) => a.eventDate.localeCompare(b.eventDate));
    rows.forEach((row, i) => {
      row.installmentSequence = i + 1;
    });
  }

  return result;
}

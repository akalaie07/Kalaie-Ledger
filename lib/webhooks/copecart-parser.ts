import type { NormalizedImportRow, NormalizedEventType, NormalizedPlanType } from "@/lib/import/types";
import { buildSyntheticKey, parseGermanPrice, today } from "@/lib/import/adapters/shared";

// =============================================================================
// Copecart Webhook (IPN) → NormalizedImportRow
//
// Copecart sendet JSON per POST. Die Feldnamen orientieren sich an den
// bekannten CSV-Spalten, können aber leicht variieren.
// =============================================================================

function mapStatus(raw: string): NormalizedEventType {
  const s = raw.toLowerCase().trim();
  if (s === "bezahlt") return "payment_paid";
  if (s === "ausstehend") return "payment_pending";
  if (s === "fehlgeschlagen") return "payment_failed";
  if (s === "erfolgreich erstattet" || s === "erstattet") return "refund";
  if (s === "rückbuchung erfolgreich" || s === "rueckbuchung erfolgreich") return "chargeback";
  if (s === "stornierung der rückbuchung" || s === "stornierung der rueckbuchung") return "chargeback_reversal";
  // Englische Varianten
  if (s.includes("paid") || s.includes("completed") || s.includes("success")) return "payment_paid";
  if (s.includes("failed") || s.includes("declined")) return "payment_failed";
  if (s.includes("refund")) return "refund";
  if (s.includes("chargeback")) return "chargeback";
  if (s.includes("pending")) return "payment_pending";
  return "unknown";
}

function mapPlan(raw: string): NormalizedPlanType {
  const p = raw.toLowerCase().trim();
  if (p.includes("abonnement") || p.includes("abo") || p.includes("subscription")) return "subscription";
  if (p.includes("rate") || p.includes("teilzahl") || p.includes("raten") || p.includes("installment")) return "installments";
  if (p.includes("einmal") || p.includes("one_time") || p.includes("onetime")) return "one_time";
  return "unknown";
}

function str(val: unknown): string {
  return val != null ? String(val).trim() : "";
}

function pick(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const val = str(obj[key]);
    if (val) return val;
  }
  return "";
}

export function parseCopecartWebhook(payload: Record<string, unknown>): NormalizedImportRow | null {
  // Bestell-ID — Pflichtfeld
  const orderId = pick(payload, "order_id", "bestell_id", "bestell-id", "bestellnummer", "id");
  if (!orderId) return null;

  const trxId = pick(payload, "transaction_id", "transaktions_id", "transaktions-id", "trx_id") || null;

  // Status
  const statusRaw = pick(payload, "status", "payment_status", "zahlungsstatus");
  const eventType = mapStatus(statusRaw);

  // Kundenname: direkt oder verschachtelt unter "customer"
  const customer = payload["customer"] as Record<string, unknown> | undefined;
  const customerName =
    pick(payload, "customer_name", "kundenname", "name") ||
    pick(customer ?? {}, "name", "full_name", "fullname") ||
    [
      pick(payload, "first_name", "vorname") || pick(customer ?? {}, "first_name", "vorname"),
      pick(payload, "last_name", "nachname") || pick(customer ?? {}, "last_name", "nachname"),
    ]
      .filter(Boolean)
      .join(" ") ||
    "Unbekannt";

  const customerEmail =
    pick(payload, "customer_email", "email", "e-mail") ||
    pick(customer ?? {}, "email", "e-mail") ||
    null;

  // Produkt
  const product = payload["product"] as Record<string, unknown> | undefined;
  const productRawName =
    pick(payload, "product_name", "produktname", "produkt") ||
    pick(product ?? {}, "name", "title") ||
    null;

  // Betrag: netto bevorzugen
  const amountRaw =
    payload["amount"] ??
    payload["netto"] ??
    payload["nettopreis"] ??
    payload["brutto"] ??
    payload["bruttopreis"] ??
    0;
  const amount =
    typeof amountRaw === "number"
      ? amountRaw
      : (parseGermanPrice(String(amountRaw)) ?? 0);

  const currency = pick(payload, "currency", "währung", "waehrung") || "EUR";

  // Datum
  const dateRaw = pick(payload, "created_at", "date", "datum", "transaction_date", "bestelldatum", "transaktionsdatum");
  const eventDate = dateRaw ? dateRaw.slice(0, 10) : today();

  // Zahlungsplan
  const planRaw = pick(payload, "payment_plan", "zahlungsplan", "zahlungsart", "plan");
  const planType = mapPlan(planRaw);
  const isSubscription = planType === "subscription";

  // Ratennummer — bei Abonnement NICHT als installmentSequence zählen (wie im CSV-Adapter)
  const rateNrRaw = pick(payload, "installment_number", "rate_nr", "ratennummer", "anzahl_der_rate", "rate");
  const rateNr = parseInt(rateNrRaw, 10);
  const installmentSequence = !isSubscription && !isNaN(rateNr) && rateNr > 0 ? rateNr : null;

  const syntheticKey = buildSyntheticKey([
    "copecart",
    trxId || orderId,
    rateNrRaw || "0",
  ]);

  const rawData: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload)) {
    rawData[k] = str(v);
  }

  const warnings: string[] = [];
  if (eventType === "unknown") {
    warnings.push(`Unbekannter Status: "${statusRaw}" — bitte manuell prüfen.`);
  }
  if (planType === "unknown" && planRaw) {
    warnings.push(`Unbekannter Zahlungsplan: "${planRaw}"`);
  }
  if (isSubscription && !isNaN(rateNr) && rateNr > 0) {
    warnings.push(`Abonnement: Rate Nr. ${rateNr} wird nicht als Raten-Sequenz gewertet.`);
  }

  return {
    source: "copecart",
    rowNumber: 1,
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
  };
}

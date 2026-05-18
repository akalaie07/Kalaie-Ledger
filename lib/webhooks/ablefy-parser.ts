import type { NormalizedImportRow, NormalizedEventType, NormalizedPlanType } from "@/lib/import/types";
import { buildSyntheticKey, parseGermanPrice, today } from "@/lib/import/adapters/shared";

// =============================================================================
// Ablefy Webhook (IPN) → NormalizedImportRow
//
// Ablefy sendet JSON per POST. Feldnamen können leicht variieren —
// dieser Parser akzeptiert alle bekannten Varianten.
// Falls ein echtes Event unbekannte Felder hat: rawData enthält alles zur Analyse.
// =============================================================================

function mapEvent(raw: string): NormalizedEventType {
  const e = raw.toLowerCase();
  if (e.includes("success") || e.includes("paid") || e.includes("completed") || e.includes("zahlungseingang"))
    return "payment_paid";
  if (e.includes("failed") || e.includes("declined") || e.includes("fehlgeschlagen"))
    return "payment_failed";
  if (e.includes("chargeback") || e.includes("rueckbuchung") || e.includes("rückbuchung"))
    return "chargeback";
  if (e.includes("refund") || e.includes("erstattet") || e.includes("storno"))
    return "refund";
  if (e.includes("pending") || e.includes("ausstehend"))
    return "payment_pending";
  return "unknown";
}

function mapPlan(raw: string): NormalizedPlanType {
  const p = raw.toLowerCase();
  if (p.includes("rate") || p.includes("installment") || p.includes("teilzahl"))
    return "installments";
  if (p.includes("abo") || p.includes("subscription"))
    return "subscription";
  if (p.includes("einmal") || p.includes("one_time") || p.includes("onetime"))
    return "one_time";
  return "unknown";
}

function str(val: unknown): string {
  return val != null ? String(val).trim() : "";
}

function pick(payload: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const val = str(payload[key]);
    if (val) return val;
  }
  return "";
}

export function parseAblefyWebhook(payload: Record<string, unknown>): NormalizedImportRow | null {
  const orderId = pick(payload, "order_id", "bestell_id", "bestellnummer", "order");
  if (!orderId) return null;

  const trxId = pick(payload, "transaction_id", "trx_id", "transaktions_id") || null;
  const installmentId = pick(payload, "installment_id", "faelligkeit_id", "rate_id") || null;

  // Event-Typ: "event", "event_type", "typ", "type"
  const eventRaw = pick(payload, "event", "event_type", "typ", "type", "status");
  const eventType = mapEvent(eventRaw);

  // Kundenname: Vorname + Nachname aus verschiedenen Feldvarianten
  const firstName = pick(payload, "customer_firstname", "firstname", "first_name", "vorname",
    "kaeufer_vorname", "buyer_firstname");
  const lastName = pick(payload, "customer_lastname", "lastname", "last_name", "nachname",
    "kaeufer_nachname", "buyer_lastname");

  // Ablefy kann auch "customer.first_name" als verschachteltes Objekt schicken
  const customer = payload["customer"] as Record<string, unknown> | undefined;
  const resolvedFirst = firstName || pick(customer ?? {}, "first_name", "firstname", "vorname");
  const resolvedLast = lastName || pick(customer ?? {}, "last_name", "lastname", "nachname");
  const customerName = [resolvedFirst, resolvedLast].filter(Boolean).join(" ") || "Unbekannt";

  const customerEmail = pick(payload, "customer_email", "email", "kaeufer_email",
    ...(customer ? ["email"] : [])) || null;

  const productRawName = pick(payload, "product_name", "product", "produktname",
    ...(payload["product"] && typeof payload["product"] === "object"
      ? []
      : [])) || null;

  // Betrag: "amount", "bezahlt" — als Zahl oder String
  const amountRaw = payload["amount"] ?? payload["bezahlt"] ?? payload["paid_amount"] ?? 0;
  const amount =
    typeof amountRaw === "number"
      ? amountRaw
      : (parseGermanPrice(String(amountRaw)) ?? 0);

  const currency = pick(payload, "currency", "waehrung", "währung") || "EUR";

  // Datum: ISO-String oder deutsches Format
  const dateRaw = pick(payload, "created_at", "date", "datum", "transaction_date", "payment_date");
  const eventDate = dateRaw ? dateRaw.slice(0, 10) : today();

  // Zahlungsplan
  const planRaw = pick(payload, "payment_plan", "plan", "zahlungsplan", "plan_type");
  const planType = mapPlan(planRaw);

  // Raten-Sequenz: "installment_number", "rate_nummer", "installment_sequence"
  const seqRaw = payload["installment_number"] ?? payload["rate_nummer"] ?? payload["installment_sequence"] ?? null;
  const installmentSequence = seqRaw !== null && seqRaw !== "" ? Number(seqRaw) : null;

  const syntheticKey = buildSyntheticKey(["ablefy", trxId || orderId, installmentId || ""]);

  const rawData: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload)) {
    rawData[k] = str(v);
  }

  const warnings: string[] = [];
  if (eventType === "unknown") {
    warnings.push(`Unbekannter Event-Typ: "${eventRaw}" — bitte manuell prüfen.`);
  }
  if (planType === "unknown" && planRaw) {
    warnings.push(`Unbekannter Zahlungsplan: "${planRaw}"`);
  }

  return {
    source: "ablefy",
    rowNumber: 1,
    externalOrderId: orderId,
    externalTransactionId: trxId,
    externalInstallmentId: installmentId,
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
    installmentSequence,
    rawData,
    warnings,
  };
}

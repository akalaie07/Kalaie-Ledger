import "server-only";

// =============================================================================
// Ablefy REST-API Client
//
// Lädt historische Zahlungen aus der Ablefy API.
// Dokumentation: https://support.ablefy.io/
//
// Auth: Authorization: Bearer {ABLEFY_API_KEY}
// =============================================================================

const ABLEFY_API_BASE = "https://myablefy.com/api/v1";
const ABLEFY_API_KEY = process.env.ABLEFY_API_KEY!;

type AblefyApiOrder = {
  id: string;
  order_number?: string;
  status?: string;
  payment_state?: string;
  created_at?: string;
  updated_at?: string;
  total?: number | string;
  currency?: string;
  payment_plan?: string;
  customer?: {
    first_name?: string;
    last_name?: string;
    email?: string;
  };
  product?: {
    name?: string;
    id?: string;
  };
  line_items?: Array<{
    title?: string;
    price?: number;
  }>;
  transactions?: AblefyApiTransaction[];
};

type AblefyApiTransaction = {
  id?: string;
  order_id?: string;
  amount?: number | string;
  state?: string;
  created_at?: string;
  installment_number?: number;
};

type AblefyApiResponse<T> = {
  data: T[];
  meta?: {
    current_page?: number;
    total_pages?: number;
    total_count?: number;
    per_page?: number;
  };
  // Ablefy kann auch direkt ein Array zurückgeben
};

async function ablefyFetch<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(`${ABLEFY_API_BASE}${path}`);
  for (const [key, val] of Object.entries(params)) {
    url.searchParams.set(key, String(val));
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${ABLEFY_API_KEY}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Ablefy API Fehler ${response.status}: ${await response.text()}`);
  }

  return response.json() as Promise<T>;
}

// =============================================================================
// Alle Bestellungen abrufen (paginiert)
// =============================================================================

export async function fetchAllAblefyOrders(): Promise<AblefyApiOrder[]> {
  const allOrders: AblefyApiOrder[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    let data: AblefyApiOrder[];

    try {
      const response = await ablefyFetch<AblefyApiResponse<AblefyApiOrder> | AblefyApiOrder[]>(
        "/orders",
        { page, per_page: perPage },
      );

      // Ablefy gibt entweder { data: [...] } oder direkt [...] zurück
      if (Array.isArray(response)) {
        data = response;
      } else {
        data = response.data ?? [];
        const totalPages = response.meta?.total_pages ?? 1;
        if (page >= totalPages) {
          allOrders.push(...data);
          break;
        }
      }
    } catch {
      // Fallback: Transaktionen statt Orders versuchen
      try {
        data = await ablefyFetch<AblefyApiOrder[]>("/transactions", { page, per_page: perPage });
      } catch (err) {
        throw new Error(`Ablefy API nicht erreichbar: ${err}`);
      }
    }

    if (data.length === 0) break;
    allOrders.push(...data);

    if (data.length < perPage) break;
    page++;
  }

  return allOrders;
}

// =============================================================================
// Ablefy API Order → NormalizedImportRow
// =============================================================================

import type { NormalizedImportRow, NormalizedEventType, NormalizedPlanType } from "@/lib/import/types";
import { buildSyntheticKey, today } from "@/lib/import/adapters/shared";

function mapState(state?: string): NormalizedEventType {
  const s = (state ?? "").toLowerCase();
  if (s.includes("paid") || s.includes("success") || s.includes("completed") || s.includes("captured"))
    return "payment_paid";
  if (s.includes("failed") || s.includes("declined"))
    return "payment_failed";
  if (s.includes("refund"))
    return "refund";
  if (s.includes("chargeback"))
    return "chargeback";
  if (s.includes("pending") || s.includes("open"))
    return "payment_pending";
  return "unknown";
}

function mapPlan(plan?: string): NormalizedPlanType {
  const p = (plan ?? "").toLowerCase();
  if (p.includes("rate") || p.includes("installment")) return "installments";
  if (p.includes("abo") || p.includes("subscription")) return "subscription";
  if (p.includes("einmal") || p.includes("one")) return "one_time";
  return "unknown";
}

export function ablefyOrderToNormalizedRows(order: AblefyApiOrder): NormalizedImportRow[] {
  const orderId = String(order.id ?? order.order_number ?? "");
  if (!orderId) return [];

  const customerName = [
    order.customer?.first_name ?? "",
    order.customer?.last_name ?? "",
  ].filter(Boolean).join(" ") || "Unbekannt";

  const customerEmail = order.customer?.email ?? null;
  const productRawName = order.product?.name ?? order.line_items?.[0]?.title ?? null;
  const currency = order.currency ?? "EUR";
  const planType = mapPlan(order.payment_plan);

  // Hat der Order Einzel-Transaktionen?
  if (order.transactions && order.transactions.length > 0) {
    return order.transactions.map((trx, idx) => {
      const trxId = String(trx.id ?? "");
      const amount = typeof trx.amount === "number" ? trx.amount : parseFloat(String(trx.amount ?? "0")) || 0;
      const eventDate = trx.created_at?.slice(0, 10) ?? today();
      const eventType = mapState(trx.state);
      const seq = trx.installment_number ?? null;

      return {
        source: "ablefy" as const,
        rowNumber: idx + 1,
        externalOrderId: orderId,
        externalTransactionId: trxId || null,
        externalInstallmentId: null,
        syntheticKey: buildSyntheticKey(["ablefy", trxId || orderId, String(seq ?? idx)]),
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
        installmentSequence: seq,
        rawData: { order_id: orderId, transaction_id: trxId, state: trx.state ?? "", amount: String(amount) },
        warnings: eventType === "unknown" ? [`Unbekannter Status: "${trx.state}"`] : [],
      };
    });
  }

  // Kein Einzel-Transaktionen → Order selbst als eine Row
  const amount = typeof order.total === "number" ? order.total : parseFloat(String(order.total ?? "0")) || 0;
  const eventDate = order.created_at?.slice(0, 10) ?? today();
  const eventType = mapState(order.payment_state ?? order.status);

  return [{
    source: "ablefy" as const,
    rowNumber: 1,
    externalOrderId: orderId,
    externalTransactionId: null,
    externalInstallmentId: null,
    syntheticKey: buildSyntheticKey(["ablefy", orderId, ""]),
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
    installmentSequence: null,
    rawData: { order_id: orderId, status: order.status ?? "", payment_state: order.payment_state ?? "" },
    warnings: eventType === "unknown" ? [`Unbekannter Status: "${order.payment_state ?? order.status}"`] : [],
  }];
}

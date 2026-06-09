"use server";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/get-current-org";
import { classifyRows } from "@/lib/import/preview";
import type { DealContext, InstallmentContext } from "@/lib/import/preview";
import type { NormalizedImportRow, PreviewItem } from "@/lib/import/types";

// =============================================================================
// previewImport — Server Action
//
// Lädt den aktuellen DB-Zustand für alle betroffenen Bestell-IDs sowie alle
// weiteren Deals der Org für Fuzzy-Matching. Gibt klassifizierte PreviewItems
// zurück — ohne in die DB zu schreiben.
// =============================================================================

export async function previewImport(normalized: NormalizedImportRow[]): Promise<PreviewItem[]> {
  const session = await requireRole("admin");
  if (normalized.length === 0) return [];

  const supabase = await createClient();
  const { organizationId } = session;

  const orderIds = [
    ...new Set(normalized.map((r) => r.externalOrderId).filter(Boolean)),
  ];

  // ── Schritt 1: Alle Deals der Org laden (Exact-Match + Fuzzy-Pool) ─────────
  const [
    { data: platforms },
    { data: products },
    { data: allDealsRaw },
  ] = await Promise.all([
    supabase.from("platforms").select("id, name").eq("organization_id", organizationId),
    supabase.from("products").select("id, name").eq("organization_id", organizationId),
    supabase
      .from("deals")
      .select("id, order_id, customer_name, customer_email, total_price, payment_type, product_id, platform_id")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const platformMap = new Map((platforms ?? []).map((p) => [p.id, p.name]));
  const productMap = new Map((products ?? []).map((p) => [p.id, p.name]));

  function buildDealContext(deal: {
    id: string;
    order_id: string | null;
    customer_name: string;
    customer_email?: string | null;
    total_price: number;
    payment_type: string;
    product_id: string | null;
    platform_id: string | null;
  }): DealContext {
    return {
      id: deal.id,
      orderId: deal.order_id,
      customerName: deal.customer_name,
      customerEmail: deal.customer_email ?? null,
      totalPrice: deal.total_price,
      paymentType: deal.payment_type as "one_time" | "installments",
      productId: deal.product_id ?? null,
      productName: deal.product_id ? (productMap.get(deal.product_id) ?? null) : null,
      platformId: deal.platform_id ?? null,
      platformName: deal.platform_id ? (platformMap.get(deal.platform_id) ?? null) : null,
      installments: [],
      oneTimePayment: null,
    };
  }

  const allDeals = (allDealsRaw ?? []).map(buildDealContext);

  // Exact-Match Deals (nach orderId)
  const matchingDeals = (allDealsRaw ?? []).filter(
    (d) => d.order_id && orderIds.includes(d.order_id),
  );

  if (matchingDeals.length === 0) {
    return classifyRows(normalized, new Map(), allDeals);
  }

  // ── Schritt 2: Zahlungs-Records für Exact-Match Deals laden ───────────────
  const dealIds = matchingDeals.map((d) => d.id);

  const [{ data: installmentsRaw }, { data: otpRaw }] = await Promise.all([
    supabase
      .from("installments")
      .select("id, deal_id, sequence, paid, paid_at, amount, due_date")
      .eq("organization_id", organizationId)
      .in("deal_id", dealIds),
    supabase
      .from("one_time_payments")
      .select("deal_id, paid, paid_at")
      .eq("organization_id", organizationId)
      .in("deal_id", dealIds),
  ]);

  const installmentsByDeal = new Map<string, InstallmentContext[]>();
  for (const inst of installmentsRaw ?? []) {
    if (!installmentsByDeal.has(inst.deal_id)) {
      installmentsByDeal.set(inst.deal_id, []);
    }
    installmentsByDeal.get(inst.deal_id)!.push({
      id: inst.id,
      sequence: inst.sequence,
      paid: inst.paid ?? false,
      paidAt: inst.paid_at ?? null,
      amount: inst.amount,
      dueDate: inst.due_date,
    });
  }

  const otpByDeal = new Map<string, { paid: boolean; paidAt: string | null }>();
  for (const otp of otpRaw ?? []) {
    otpByDeal.set(otp.deal_id, { paid: otp.paid ?? false, paidAt: otp.paid_at ?? null });
  }

  // ── DealContext-Map aufbauen (mit Zahlungs-Records) ───────────────────────
  const dealsByOrderId = new Map<string, DealContext>();
  for (const deal of matchingDeals) {
    if (!deal.order_id) continue;
    dealsByOrderId.set(deal.order_id, {
      ...buildDealContext(deal),
      installments: installmentsByDeal.get(deal.id) ?? [],
      oneTimePayment: otpByDeal.get(deal.id) ?? null,
    });
  }

  return classifyRows(normalized, dealsByOrderId, allDeals);
}

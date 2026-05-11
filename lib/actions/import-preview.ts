"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/get-current-org";
import { classifyRows } from "@/lib/import/preview";
import type { DealContext, InstallmentContext } from "@/lib/import/preview";
import type { NormalizedImportRow, PreviewItem } from "@/lib/import/types";

// =============================================================================
// previewImport — Server Action
//
// Lädt den aktuellen DB-Zustand für alle betroffenen Bestell-IDs
// und gibt klassifizierte PreviewItems zurück — ohne in die DB zu schreiben.
// =============================================================================

export async function previewImport(normalized: NormalizedImportRow[]): Promise<PreviewItem[]> {
  const session = await getCurrentSession();
  if (!session) return [];
  if (normalized.length === 0) return [];

  const supabase = await createClient();

  const orderIds = [
    ...new Set(normalized.map((r) => r.externalOrderId).filter(Boolean)),
  ];

  // ── Schritt 1: Deals laden ─────────────────────────────────────────────────
  const { data: deals } = await supabase
    .from("deals")
    .select("id, order_id, customer_name, total_price, payment_type, product_id, platform_id")
    .eq("organization_id", session.organizationId)
    .in("order_id", orderIds);

  if (!deals || deals.length === 0) {
    // Kein Deal gefunden → alle Rows direkt klassifizieren (alles "create_deal")
    return classifyRows(normalized, new Map());
  }

  const dealIds = deals.map((d) => d.id);

  // ── Schritt 2: Zahlungs-Records laden ─────────────────────────────────────
  const [
    { data: installmentsRaw },
    { data: otpRaw },
    { data: platforms },
    { data: products },
  ] = await Promise.all([
    supabase
      .from("installments")
      .select("id, deal_id, sequence, paid, paid_at, amount, due_date")
      .eq("organization_id", session.organizationId)
      .in("deal_id", dealIds),
    supabase
      .from("one_time_payments")
      .select("deal_id, paid, paid_at")
      .eq("organization_id", session.organizationId)
      .in("deal_id", dealIds),
    supabase
      .from("platforms")
      .select("id, name")
      .eq("organization_id", session.organizationId),
    supabase
      .from("products")
      .select("id, name")
      .eq("organization_id", session.organizationId),
  ]);

  // ── Lookup-Maps aufbauen ───────────────────────────────────────────────────
  const platformMap = new Map((platforms ?? []).map((p) => [p.id, p.name]));
  const productMap = new Map((products ?? []).map((p) => [p.id, p.name]));

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
    otpByDeal.set(otp.deal_id, {
      paid: otp.paid ?? false,
      paidAt: otp.paid_at ?? null,
    });
  }

  // ── DealContext-Map aufbauen ───────────────────────────────────────────────
  const dealsByOrderId = new Map<string, DealContext>();
  for (const deal of deals) {
    if (!deal.order_id) continue;
    dealsByOrderId.set(deal.order_id, {
      id: deal.id,
      orderId: deal.order_id,
      customerName: deal.customer_name,
      totalPrice: deal.total_price,
      paymentType: deal.payment_type as "one_time" | "installments",
      productId: deal.product_id ?? null,
      productName: deal.product_id ? (productMap.get(deal.product_id) ?? null) : null,
      platformId: deal.platform_id ?? null,
      platformName: deal.platform_id ? (platformMap.get(deal.platform_id) ?? null) : null,
      installments: installmentsByDeal.get(deal.id) ?? [],
      oneTimePayment: otpByDeal.get(deal.id) ?? null,
    });
  }

  return classifyRows(normalized, dealsByOrderId);
}

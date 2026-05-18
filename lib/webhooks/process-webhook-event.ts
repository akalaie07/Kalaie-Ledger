import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { classifyRows } from "@/lib/import/preview";
import type { DealContext, InstallmentContext } from "@/lib/import/preview";
import type { NormalizedImportRow } from "@/lib/import/types";

// =============================================================================
// processWebhookEvent
//
// Verarbeitet eine einzelne NormalizedImportRow aus einem Webhook-Event.
// Verwendet den Service-Role-Client (kein Auth-Check nötig).
// Repliziert die Preview + Execute Pipeline für einen einzelnen Event.
// =============================================================================

export async function processWebhookEvent(
  normalized: NormalizedImportRow,
  organizationId: string,
): Promise<{ success: boolean; action: string; error?: string }> {
  const supabase = createAdminClient();
  const orderId = normalized.externalOrderId;

  // ── DB-Kontext laden (Deals + Zahlungs-Records) ───────────────────────────
  const [{ data: platforms }, { data: products }, { data: allDealsRaw }] = await Promise.all([
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
  const platformNameToId = new Map((platforms ?? []).map((p) => [p.name.toLowerCase(), p.id]));

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
  const matchingDeal = (allDealsRaw ?? []).find((d) => d.order_id === orderId);

  let dealsByOrderId = new Map<string, DealContext>();

  if (matchingDeal) {
    const [{ data: installmentsRaw }, { data: otpRaw }] = await Promise.all([
      supabase
        .from("installments")
        .select("id, deal_id, sequence, paid, paid_at, amount, due_date")
        .eq("organization_id", organizationId)
        .eq("deal_id", matchingDeal.id),
      supabase
        .from("one_time_payments")
        .select("deal_id, paid, paid_at")
        .eq("organization_id", organizationId)
        .eq("deal_id", matchingDeal.id),
    ]);

    const installments: InstallmentContext[] = (installmentsRaw ?? []).map((i) => ({
      id: i.id,
      sequence: i.sequence,
      paid: i.paid ?? false,
      paidAt: i.paid_at ?? null,
      amount: i.amount,
      dueDate: i.due_date,
    }));

    const otp = otpRaw?.[0] ?? null;
    dealsByOrderId.set(orderId, {
      ...buildDealContext(matchingDeal),
      installments,
      oneTimePayment: otp ? { paid: otp.paid ?? false, paidAt: otp.paid_at ?? null } : null,
    });
  }

  // ── Preview-Klassifikation ────────────────────────────────────────────────
  const [item] = classifyRows([normalized], dealsByOrderId, allDeals);
  if (!item) return { success: false, action: "error", error: "Klassifikation fehlgeschlagen" };

  // ── Batch-Eintrag anlegen ─────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: batch, error: batchErr } = await (supabase as any)
    .from("import_batches")
    .insert({
      organization_id: organizationId,
      source: "ablefy",
      filename: "webhook",
      row_count: 1,
      status: "pending",
    })
    .select("id")
    .single();

  if (batchErr || !batch) {
    return { success: false, action: "error", error: `Batch-Fehler: ${batchErr?.message}` };
  }
  const batchId = (batch as { id: string }).id;

  let dealId = item.dealId;
  const n = item.normalized;

  try {
    // ── Neuen Deal anlegen ────────────────────────────────────────────────
    if ((item.action === "create_deal" || item.action === "bootstrap_deal") && !dealId) {
      const platformId = n.platformRawName
        ? (platformNameToId.get(n.platformRawName.toLowerCase()) ?? null)
        : null;

      const productId = products?.find((p) => {
        const needle = (n.productRawName ?? "").toLowerCase().replace(/[^a-z0-9äöüß]/g, "");
        const hay = p.name.toLowerCase().replace(/[^a-z0-9äöüß]/g, "");
        return needle === hay || needle.includes(hay) || hay.includes(needle);
      })?.id ?? null;

      const paymentType = n.planType === "one_time" ? "one_time" : "installments";
      const estimatedTotal = paymentType === "one_time" ? n.amount : 0;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: deal, error: dealErr } = await (supabase as any)
        .from("deals")
        .insert({
          organization_id: organizationId,
          customer_name: n.customerName !== "Unbekannt" ? n.customerName : "Unbekannt – bitte ergänzen",
          customer_email: n.customerEmail ?? null,
          order_id: n.externalOrderId,
          platform_id: platformId,
          product_id: productId,
          total_price: estimatedTotal,
          payment_type: paymentType,
          close_date: n.eventDate,
          import_batch_id: batchId,
          notes: paymentType === "installments" ? "Gesamtpreis muss manuell geprüft werden." : null,
        })
        .select("id")
        .single();

      if (dealErr || !deal) {
        await completeBatch(supabase, batchId, organizationId, "failed");
        return { success: false, action: item.action, error: `Deal-Fehler: ${dealErr?.message}` };
      }
      dealId = (deal as { id: string }).id;

      // Zahlungs-Record anlegen
      if (paymentType === "one_time") {
        await supabase.from("one_time_payments").insert({
          deal_id: dealId,
          organization_id: organizationId,
          due_date: n.eventDate,
        });
      } else if (n.installmentSequence !== null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("installments").insert({
          deal_id: dealId,
          organization_id: organizationId,
          sequence: n.installmentSequence,
          due_date: n.eventDate,
          amount: n.amount,
          import_batch_id: batchId,
        });
      }
    }

    // ── Zahlung als bezahlt markieren ─────────────────────────────────────
    if (n.eventType === "payment_paid" && dealId) {
      if (item.action === "mark_paid_one_time" || item.action === "create_deal") {
        await supabase
          .from("one_time_payments")
          .update({ paid: true, paid_at: new Date().toISOString() })
          .eq("deal_id", dealId)
          .eq("organization_id", organizationId)
          .eq("paid", false);
      } else if (
        (item.action === "mark_paid_installment" || item.action === "create_installment_and_mark_paid") &&
        n.installmentSequence !== null
      ) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("installments").upsert(
          {
            deal_id: dealId,
            organization_id: organizationId,
            sequence: n.installmentSequence,
            due_date: n.eventDate,
            amount: n.amount,
            paid: true,
            paid_at: new Date().toISOString(),
          },
          { onConflict: "deal_id,sequence", ignoreDuplicates: false },
        );
      }
    }

    // ── Benachrichtigung bei Fehlschlag / Rückbuchung ─────────────────────
    if (n.eventType === "payment_failed" || n.eventType === "chargeback") {
      await createPaymentAlert(supabase, organizationId, n, dealId);
    }

    // ── import_rows schreiben ─────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("import_rows").insert({
      batch_id: batchId,
      organization_id: organizationId,
      row_number: 1,
      synthetic_key: n.syntheticKey,
      action: item.action,
      classification: item.classification,
      deal_id: dealId,
      installment_id: null,
      raw_data: n.rawData,
    });

    await completeBatch(supabase, batchId, organizationId, "completed");
    return { success: true, action: item.action };
  } catch (err) {
    await completeBatch(supabase, batchId, organizationId, "failed");
    throw err;
  }
}

// =============================================================================
// Hilfsfunktionen
// =============================================================================

async function completeBatch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  batchId: string,
  organizationId: string,
  status: "completed" | "failed",
) {
  await supabase
    .from("import_batches")
    .update({ status })
    .eq("id", batchId)
    .eq("organization_id", organizationId);
}

async function createPaymentAlert(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  organizationId: string,
  n: NormalizedImportRow,
  dealId: string | null,
) {
  const label = n.eventType === "chargeback" ? "Rückbuchung" : "Zahlung fehlgeschlagen";
  const message = `${label}: ${n.customerName} (Bestellung ${n.externalOrderId}) — ${n.amount} ${n.currency} am ${n.eventDate}`;

  // Schreiben in payment_alerts Tabelle (falls vorhanden) oder notes auf dem Deal
  if (dealId) {
    const { data: deal } = await supabase
      .from("deals")
      .select("notes")
      .eq("id", dealId)
      .maybeSingle();

    const existingNotes = (deal as { notes?: string | null } | null)?.notes ?? "";
    const newNote = existingNotes
      ? `${existingNotes}\n[ALERT ${new Date().toISOString().slice(0, 10)}] ${message}`
      : `[ALERT ${new Date().toISOString().slice(0, 10)}] ${message}`;

    await supabase
      .from("deals")
      .update({ notes: newNote })
      .eq("id", dealId)
      .eq("organization_id", organizationId);
  }
}

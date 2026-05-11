"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/get-current-org";
import type { PreviewItem, NormalizedImportRow } from "@/lib/import/types";

// =============================================================================
// Typen
// =============================================================================

export type ExecuteResult = {
  created: number;
  paid: number;
  installmentsCreated: number;
  skipped: number;
  reviewNeeded: number;
  errors: string[];
  reviewItems: string[];
};

// =============================================================================
// Hilfsfunktionen
// =============================================================================

/** Fuzzy-Produktname-Matching */
function findProductId(
  products: { id: string; name: string }[] | null,
  rawName: string | undefined,
): string | null {
  if (!rawName || !products?.length) return null;
  const needle = rawName.toLowerCase().replace(/[^a-z0-9äöüß]/g, "");
  const exact = products.find((p) => p.name.toLowerCase() === rawName.toLowerCase());
  if (exact) return exact.id;
  return (
    products.find((p) => {
      const hay = p.name.toLowerCase().replace(/[^a-z0-9äöüß]/g, "");
      return needle.includes(hay) || hay.includes(needle);
    })?.id ?? null
  );
}

// =============================================================================
// executeImport — schreibt in die DB basierend auf klassifizierten PreviewItems
// =============================================================================

/**
 * Verarbeitet die klassifizierten Preview-Items und schreibt in die DB.
 *
 * Zwei Phasen:
 *  1. Deal-Erstellung (dedupliziert pro orderId, nur wenn kein Deal existiert)
 *  2. Zahlungs-Markierung (bezahlt/neu anlegen) für alle Items
 */
export async function executeImport(items: PreviewItem[]): Promise<ExecuteResult> {
  const session = await requireRole("admin");

  const supabase = await createClient();
  const { organizationId, userId } = session;

  const [{ data: platforms }, { data: products }] = await Promise.all([
    supabase.from("platforms").select("id, name").eq("organization_id", organizationId),
    supabase.from("products").select("id, name").eq("organization_id", organizationId),
  ]);

  const platformNameToId = new Map(
    (platforms ?? []).map((p) => [p.name.toLowerCase(), p.id]),
  );

  let created = 0;
  let paid = 0;
  let installmentsCreated = 0;
  let skipped = 0;
  let reviewNeeded = 0;
  const errors: string[] = [];
  const reviewItems: string[] = [];

  // In-Memory Cache für frisch angelegte Deals (orderId → dealId)
  const newDealCache = new Map<string, string>();

  // Hilfsfunktion: dealId aus Cache oder DB laden
  async function resolveDealId(orderId: string): Promise<string | null> {
    if (newDealCache.has(orderId)) return newDealCache.get(orderId)!;
    const { data } = await supabase
      .from("deals")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("order_id", orderId)
      .maybeSingle();
    return data?.id ?? null;
  }

  // ── Phase 1: Neue Deals anlegen ──────────────────────────────────────────
  // Nur Items wo kein Deal existierte (oldValues === null) und action "create" oder "bootstrap".
  const CREATE_ACTIONS = new Set(["create_deal", "bootstrap_deal"]);
  const itemsNeedingNewDeal = items.filter(
    (i) => CREATE_ACTIONS.has(i.action) && i.oldValues === null,
  );
  const uniqueOrderIdsForCreation = [
    ...new Set(itemsNeedingNewDeal.map((i) => i.normalized.externalOrderId)),
  ];

  for (const orderId of uniqueOrderIdsForCreation) {
    // Repräsentativer Item (erster) + alle payment_paid-Items für diese Order
    const rep = itemsNeedingNewDeal.find(
      (i) => i.normalized.externalOrderId === orderId,
    )!.normalized;
    const paidItemsForOrder = items.filter(
      (i) =>
        i.normalized.externalOrderId === orderId &&
        i.normalized.eventType === "payment_paid",
    );

    const platformId = rep.platformRawName
      ? (platformNameToId.get(rep.platformRawName.toLowerCase()) ?? null)
      : null;
    const productId = findProductId(products, rep.productRawName ?? undefined);

    const paymentType: "one_time" | "installments" =
      rep.planType === "one_time" ? "one_time" : "installments";

    // Gesamtpreis: bei Einmalzahlung ist rep.amount verlässlich.
    // Bei Raten/Abos ist die Summe der importierten Raten kein sicherer
    // Gesamtpreis (Teilexport möglich) → 0 schreiben, Notiz setzen.
    const estimatedTotal = paymentType === "one_time" ? rep.amount : 0;

    // Legacy-XLSX: order_id aus "legacy-..." Prefix nicht in DB schreiben
    const dbOrderId = orderId.startsWith("legacy-") ? null : orderId;

    const { data: deal, error: dealErr } = await supabase
      .from("deals")
      .insert({
        organization_id: organizationId,
        created_by: userId,
        customer_name:
          rep.customerName !== "Unbekannt"
            ? rep.customerName
            : "Unbekannt – bitte ergänzen",
        order_id: dbOrderId,
        platform_id: platformId,
        product_id: productId,
        total_price: estimatedTotal,
        payment_type: paymentType,
        close_date: rep.eventDate,
        notes:
          paymentType === "installments"
            ? [
                "Gesamtpreis muss manuell geprüft werden.",
                rep.source === "legacy_xlsx" && rep.productRawName
                  ? rep.productRawName
                  : null,
              ]
                .filter(Boolean)
                .join(" | ")
            : rep.source === "legacy_xlsx" && rep.productRawName
            ? rep.productRawName
            : null,
      })
      .select("id")
      .single();

    if (dealErr || !deal) {
      errors.push(
        `${orderId}: Deal konnte nicht angelegt werden — ${dealErr?.message ?? "unbekannter Fehler"}`,
      );
      continue;
    }

    newDealCache.set(orderId, deal.id);
    created++;

    // Zahlungs-Records anlegen (noch nicht als bezahlt markiert — passiert in Phase 2)
    if (paymentType === "one_time") {
      await supabase.from("one_time_payments").insert({
        deal_id: deal.id,
        organization_id: organizationId,
        due_date: rep.eventDate,
      });
    } else {
      // Installments für alle bekannten Sequenzen anlegen
      const sequences = [
        ...new Set(
          paidItemsForOrder
            .map((i) => i.normalized.installmentSequence)
            .filter((s): s is number => s !== null),
        ),
      ].sort((a, b) => a - b);

      if (sequences.length > 0) {
        const toInsert = sequences.map((seq) => {
          const seqItem = paidItemsForOrder.find(
            (i) => i.normalized.installmentSequence === seq,
          );
          const seqAmount =
            seqItem?.normalized.amount ??
            Math.round((estimatedTotal / sequences.length) * 100) / 100;
          return {
            deal_id: deal.id,
            organization_id: organizationId,
            sequence: seq,
            due_date: seqItem?.normalized.eventDate ?? rep.eventDate,
            amount: seqAmount,
          };
        });
        const { error: instErr } = await supabase
          .from("installments")
          .insert(toInsert);
        if (!instErr) installmentsCreated += toInsert.length;
        else
          errors.push(`${orderId}: Raten konnten nicht angelegt werden — ${instErr.message}`);
      }
    }
  }

  // ── Phase 2: Zahlungen markieren ─────────────────────────────────────────
  for (const item of items) {
    const n = item.normalized;
    const orderId = n.externalOrderId;
    const label = `${n.customerName} (${orderId})`;

    switch (item.action) {
      // ── Überspringen ────────────────────────────────────────────────────
      case "skip_already_paid":
      case "skip_no_match":
        skipped++;
        continue;

      // ── Review erforderlich ─────────────────────────────────────────────
      case "needs_review":
        reviewNeeded++;
        reviewItems.push(`${label}: ${item.reason}`);
        continue;

      case "mark_failed":
        reviewNeeded++;
        reviewItems.push(`${label}: Fehlgeschlagene Zahlung — bitte manuell prüfen`);
        continue;

      case "mark_chargeback":
        reviewNeeded++;
        reviewItems.push(`${label}: Rückbuchung — manuelle Nachverfolgung erforderlich`);
        continue;

      case "mark_chargeback_reversal":
        reviewNeeded++;
        reviewItems.push(`${label}: Rückbuchung-Stornierung — manuelle Prüfung`);
        continue;

      case "mark_refunded":
        reviewNeeded++;
        reviewItems.push(`${label}: Erstattung — bitte manuell im Deal vermerken`);
        continue;

      // ── Fehler ──────────────────────────────────────────────────────────
      case "error":
        errors.push(`Zeile ${item.rowNumber}: ${item.reason}`);
        continue;

      // ── Deal anlegen + bezahlt markieren ────────────────────────────────
      case "create_deal":
      case "bootstrap_deal": {
        if (n.eventType !== "payment_paid") continue;

        const dealId = await resolveDealId(orderId);
        if (!dealId) {
          if (item.action === "bootstrap_deal" && item.oldValues === null) {
            // Wurde in Phase 1 nicht angelegt (Fehler trat auf)
            errors.push(`${label}: Deal nicht in Phase 1 angelegt — übersprungen.`);
          }
          // bootstrap_deal für bestehenden Deal ohne Plattform:
          // dealId sollte hier vorhanden sein
          continue;
        }

        const marked = await markAsPaid(supabase, organizationId, dealId, n);
        if (marked.error) errors.push(`${label}: ${marked.error}`);
        else if (marked.success) paid++;
        continue;
      }

      // ── Einmalzahlung bezahlt markieren ─────────────────────────────────
      case "mark_paid_one_time": {
        const dealId = await resolveDealId(orderId);
        if (!dealId) {
          errors.push(`${label}: Deal nicht gefunden.`);
          continue;
        }
        const { error } = await supabase
          .from("one_time_payments")
          .update({ paid: true, paid_at: new Date().toISOString() })
          .eq("deal_id", dealId)
          .eq("organization_id", organizationId)
          .eq("paid", false);
        if (error) errors.push(`${label}: ${error.message}`);
        else paid++;
        continue;
      }

      // ── Rate bezahlt markieren ───────────────────────────────────────────
      case "mark_paid_installment": {
        const dealId = await resolveDealId(orderId);
        if (!dealId) {
          errors.push(`${label}: Deal nicht gefunden.`);
          continue;
        }

        if (n.installmentSequence !== null) {
          // Bekannte Sequenz → direkt markieren
          const { error } = await supabase
            .from("installments")
            .update({ paid: true, paid_at: new Date().toISOString() })
            .eq("deal_id", dealId)
            .eq("organization_id", organizationId)
            .eq("sequence", n.installmentSequence)
            .eq("paid", false);
          if (error)
            errors.push(`${label} Rate ${n.installmentSequence}: ${error.message}`);
          else paid++;
        } else if (n.source === "digistore") {
          // Digistore Snapshot ohne eindeutige Sequenz → niemals automatisch alle Raten markieren.
          // Das wäre nur sicher wenn alle Raten im Export enthalten sind, was nicht garantiert ist.
          reviewNeeded++;
          reviewItems.push(
            `${label}: Digistore Snapshot ohne eindeutige Rate — manuelle Prüfung erforderlich.`,
          );
        } else {
          // Nicht-Digistore ohne Sequenz → alle offenen Raten markieren
          const { data: unpaid } = await supabase
            .from("installments")
            .select("id")
            .eq("deal_id", dealId)
            .eq("organization_id", organizationId)
            .eq("paid", false);
          if (unpaid && unpaid.length > 0) {
            const { error } = await supabase
              .from("installments")
              .update({ paid: true, paid_at: new Date().toISOString() })
              .eq("deal_id", dealId)
              .eq("organization_id", organizationId)
              .eq("paid", false);
            if (error) errors.push(`${label}: ${error.message}`);
            else paid += unpaid.length;
          }
        }
        continue;
      }

      // ── Rate anlegen und sofort bezahlt markieren ────────────────────────
      case "create_installment_and_mark_paid": {
        const dealId = await resolveDealId(orderId);
        if (!dealId) {
          errors.push(`${label}: Deal nicht gefunden für neue Rate.`);
          continue;
        }
        if (n.installmentSequence === null) {
          errors.push(`${label}: Raten-Sequenz unbekannt — Rate kann nicht angelegt werden.`);
          continue;
        }
        const { error: insErr } = await supabase.from("installments").upsert(
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
        if (insErr) errors.push(`${label} Rate ${n.installmentSequence}: ${insErr.message}`);
        else {
          installmentsCreated++;
          paid++;
        }
        continue;
      }

      // ── Bootstrap-Deal: Zahlung markieren ───────────────────────────────
      // (bootstrap_deal für bestehenden Deal ohne Plattform)
      // Behandelt als generisches mark_paid
      default:
        skipped++;
        continue;
    }
  }

  revalidatePath("/deals");
  revalidatePath("/import");

  return {
    created,
    paid,
    installmentsCreated,
    skipped,
    reviewNeeded,
    errors,
    reviewItems,
  };
}

// =============================================================================
// Intern: Einzel-Zahlung als bezahlt markieren (one_time oder Installment)
// =============================================================================

async function markAsPaid(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
  dealId: string,
  n: NormalizedImportRow,
): Promise<{ success: boolean; error: string | null }> {
  if (n.planType === "one_time") {
    const { error } = await supabase
      .from("one_time_payments")
      .update({ paid: true, paid_at: new Date().toISOString() })
      .eq("deal_id", dealId)
      .eq("organization_id", orgId)
      .eq("paid", false);
    return { success: !error, error: error?.message ?? null };
  }

  if (n.installmentSequence !== null) {
    const { error } = await supabase
      .from("installments")
      .update({ paid: true, paid_at: new Date().toISOString() })
      .eq("deal_id", dealId)
      .eq("organization_id", orgId)
      .eq("sequence", n.installmentSequence)
      .eq("paid", false);
    return { success: !error, error: error?.message ?? null };
  }

  return { success: false, error: null };
}

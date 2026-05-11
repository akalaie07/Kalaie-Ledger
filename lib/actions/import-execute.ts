"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/get-current-org";
import type { PreviewItem, NormalizedImportRow } from "@/lib/import/types";

// =============================================================================
// Typen
// =============================================================================

export type ExecuteResult = {
  batchId: string | null;
  created: number;
  paid: number;
  installmentsCreated: number;
  skipped: number;
  reviewNeeded: number;
  errors: string[];
  reviewItems: string[];
};

// Ein Eintrag pro verarbeiteter PreviewItem-Zeile → wird am Ende in import_rows geschrieben
type ImportRowEntry = {
  batch_id: string;
  organization_id: string;
  row_number: number;
  synthetic_key: string;
  action: string;
  classification: string;
  deal_id: string | null;
  installment_id: string | null;
  raw_data: Record<string, string>;
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
 * Ablauf:
 *  0. import_batches-Eintrag anlegen (status = 'pending')
 *  1. Deal-Erstellung (dedupliziert pro orderId, nur wenn kein Deal existiert)
 *  2. Zahlungs-Markierung (bezahlt/neu anlegen) für alle Items
 *  3. import_rows als Batch schreiben
 *  4. import_batches-Status auf 'completed' setzen
 *
 * Bei unerwartetem Fehler: Status wird auf 'failed' gesetzt, Fehler re-thrown.
 *
 * @param items     Klassifizierte PreviewItems aus previewImport()
 * @param filename  Optionaler Dateiname für das Audit-Log
 */
export async function executeImport(
  items: PreviewItem[],
  filename?: string,
): Promise<ExecuteResult> {
  const session = await requireRole("admin");

  const supabase = await createClient();
  const { organizationId, userId } = session;

  // Quelle aus erstem Item ableiten — alle Items eines Imports haben dieselbe source
  const source = items[0]?.normalized.source ?? "unknown";

  // ── Import-Batch anlegen ──────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: batch, error: batchErr } = await (supabase as any)
    .from("import_batches")
    .insert({
      organization_id: organizationId,
      created_by: userId,
      source,
      filename: filename ?? null,
      row_count: items.length,
      status: "pending",
    })
    .select("id")
    .single();

  if (batchErr || !batch) {
    return {
      batchId: null,
      created: 0,
      paid: 0,
      installmentsCreated: 0,
      skipped: 0,
      reviewNeeded: 0,
      errors: [
        `Import-Batch konnte nicht erstellt werden: ${batchErr?.message ?? "unbekannter Fehler"}`,
      ],
      reviewItems: [],
    };
  }

  const batchId: string = (batch as { id: string }).id;

  // ── Plattformen + Produkte laden ──────────────────────────────────────────
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

  // Collector: wird am Ende als Batch in import_rows geschrieben
  const importRowEntries: ImportRowEntry[] = [];

  function recordRow(
    item: PreviewItem,
    dealId: string | null,
    installmentId: string | null = null,
  ): void {
    importRowEntries.push({
      batch_id: batchId,
      organization_id: organizationId,
      row_number: item.rowNumber,
      synthetic_key: item.syntheticKey,
      action: item.action,
      classification: item.classification,
      deal_id: dealId,
      installment_id: installmentId,
      raw_data: item.normalized.rawData,
    });
  }

  // In-Memory-Cache für frisch angelegte Deals (orderId → dealId)
  const newDealCache = new Map<string, string>();

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

  try {
    // ── Phase 1: Neue Deals anlegen ────────────────────────────────────────
    // Nur Items wo kein Deal existierte (oldValues === null) und action "create" oder "bootstrap".
    const CREATE_ACTIONS = new Set(["create_deal", "bootstrap_deal"]);
    const itemsNeedingNewDeal = items.filter(
      (i) => CREATE_ACTIONS.has(i.action) && i.oldValues === null,
    );
    const uniqueOrderIdsForCreation = [
      ...new Set(itemsNeedingNewDeal.map((i) => i.normalized.externalOrderId)),
    ];

    for (const orderId of uniqueOrderIdsForCreation) {
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
      // Bei Raten/Abos ist ein Teilexport möglich → 0 schreiben, Notiz setzen.
      const estimatedTotal = paymentType === "one_time" ? rep.amount : 0;

      // Legacy-XLSX: order_id aus "legacy-..." Prefix nicht in DB schreiben
      const dbOrderId = orderId.startsWith("legacy-") ? null : orderId;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: deal, error: dealErr } = await (supabase as any)
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
          import_batch_id: batchId,
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

      const dealId: string = (deal as { id: string }).id;
      newDealCache.set(orderId, dealId);
      created++;

      // Zahlungs-Records anlegen (noch nicht als bezahlt — passiert in Phase 2)
      if (paymentType === "one_time") {
        await supabase.from("one_time_payments").insert({
          deal_id: dealId,
          organization_id: organizationId,
          due_date: rep.eventDate,
        });
      } else {
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
            return {
              deal_id: dealId,
              organization_id: organizationId,
              sequence: seq,
              due_date: seqItem?.normalized.eventDate ?? rep.eventDate,
              amount: seqItem?.normalized.amount ?? 0,
              import_batch_id: batchId,
            };
          });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: instErr } = await (supabase as any)
            .from("installments")
            .insert(toInsert);
          if (!instErr) installmentsCreated += toInsert.length;
          else
            errors.push(
              `${orderId}: Raten konnten nicht angelegt werden — ${instErr.message}`,
            );
        }
      }
    }

    // ── Phase 2: Zahlungen markieren ──────────────────────────────────────
    for (const item of items) {
      const n = item.normalized;
      const orderId = n.externalOrderId;
      const label = `${n.customerName} (${orderId})`;

      switch (item.action) {
        // ── Überspringen ──────────────────────────────────────────────────
        case "skip_already_paid":
        case "skip_no_match":
          skipped++;
          recordRow(item, null);
          continue;

        // ── Review erforderlich ───────────────────────────────────────────
        case "needs_review":
          reviewNeeded++;
          reviewItems.push(`${label}: ${item.reason}`);
          recordRow(item, null);
          continue;

        case "mark_failed":
          reviewNeeded++;
          reviewItems.push(`${label}: Fehlgeschlagene Zahlung — bitte manuell prüfen`);
          recordRow(item, null);
          continue;

        case "mark_chargeback":
          reviewNeeded++;
          reviewItems.push(`${label}: Rückbuchung — manuelle Nachverfolgung erforderlich`);
          recordRow(item, null);
          continue;

        case "mark_chargeback_reversal":
          reviewNeeded++;
          reviewItems.push(`${label}: Rückbuchung-Stornierung — manuelle Prüfung`);
          recordRow(item, null);
          continue;

        case "mark_refunded":
          reviewNeeded++;
          reviewItems.push(`${label}: Erstattung — bitte manuell im Deal vermerken`);
          recordRow(item, null);
          continue;

        // ── Fehler ────────────────────────────────────────────────────────
        case "error":
          errors.push(`Zeile ${item.rowNumber}: ${item.reason}`);
          recordRow(item, null);
          continue;

        // ── Deal anlegen + bezahlt markieren ──────────────────────────────
        case "create_deal":
        case "bootstrap_deal": {
          if (n.eventType !== "payment_paid") {
            recordRow(item, null);
            continue;
          }
          const dealId = await resolveDealId(orderId);
          if (!dealId) {
            if (item.action === "bootstrap_deal" && item.oldValues === null) {
              errors.push(`${label}: Deal nicht in Phase 1 angelegt — übersprungen.`);
            }
            recordRow(item, null);
            continue;
          }
          const marked = await markAsPaid(supabase, organizationId, dealId, n);
          if (marked.error) errors.push(`${label}: ${marked.error}`);
          else if (marked.success) paid++;
          recordRow(item, dealId);
          continue;
        }

        // ── Einmalzahlung bezahlt markieren ───────────────────────────────
        case "mark_paid_one_time": {
          const dealId = await resolveDealId(orderId);
          if (!dealId) {
            errors.push(`${label}: Deal nicht gefunden.`);
            recordRow(item, null);
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
          recordRow(item, dealId);
          continue;
        }

        // ── Rate bezahlt markieren ────────────────────────────────────────
        case "mark_paid_installment": {
          const dealId = await resolveDealId(orderId);
          if (!dealId) {
            errors.push(`${label}: Deal nicht gefunden.`);
            recordRow(item, null);
            continue;
          }

          if (n.installmentSequence !== null) {
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
            reviewNeeded++;
            reviewItems.push(
              `${label}: Digistore Snapshot ohne eindeutige Rate — manuelle Prüfung erforderlich.`,
            );
          } else {
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
          recordRow(item, dealId);
          continue;
        }

        // ── Rate anlegen und sofort bezahlt markieren ─────────────────────
        case "create_installment_and_mark_paid": {
          const dealId = await resolveDealId(orderId);
          if (!dealId) {
            errors.push(`${label}: Deal nicht gefunden für neue Rate.`);
            recordRow(item, null);
            continue;
          }
          if (n.installmentSequence === null) {
            errors.push(
              `${label}: Raten-Sequenz unbekannt — Rate kann nicht angelegt werden.`,
            );
            recordRow(item, dealId);
            continue;
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: insErr } = await (supabase as any).from("installments").upsert(
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
          recordRow(item, dealId);
          continue;
        }

        default:
          skipped++;
          recordRow(item, null);
          continue;
      }
    }

    // ── import_rows als Batch schreiben ────────────────────────────────────
    if (importRowEntries.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("import_rows").insert(importRowEntries);
    }

    // ── Batch-Status auf completed setzen ──────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("import_batches")
      .update({
        status: "completed",
        created_count: created,
        paid_count: paid,
        skipped_count: skipped,
        review_count: reviewNeeded,
        error_count: errors.length,
      })
      .eq("id", batchId)
      .eq("organization_id", organizationId);
  } catch (err) {
    // Unerwarteter Fehler → Batch als failed markieren, dann re-throw
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("import_batches")
      .update({ status: "failed" })
      .eq("id", batchId)
      .eq("organization_id", organizationId);
    throw err;
  }

  revalidatePath("/deals");
  revalidatePath("/import");

  return {
    batchId,
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

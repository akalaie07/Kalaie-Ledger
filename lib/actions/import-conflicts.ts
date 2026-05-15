"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/get-current-org";
import type { PreviewItem, FuzzyMatch, NormalizedImportRow } from "@/lib/import/types";

// =============================================================================
// Typen
// =============================================================================

export type ImportConflict = {
  id: string;
  batchId: string;
  rowNumber: number | null;
  syntheticKey: string;
  action: string;
  reason: string;
  normalized: NormalizedImportRow;
  suggestedDeals: FuzzyMatch[];
  status: "pending" | "resolved" | "skipped";
  resolvedDealId: string | null;
  createdAt: string;
};

// =============================================================================
// saveConflicts — schreibt ungelöste Items in import_conflicts
// =============================================================================

/**
 * Speichert alle Konflikt-Items eines Batches in import_conflicts.
 * Wird nach executeImport() aufgerufen wenn conflictItems.length > 0.
 */
export async function saveConflicts(
  batchId: string,
  items: PreviewItem[],
): Promise<void> {
  if (items.length === 0) return;
  const session = await requireRole("admin");
  const supabase = await createClient();

  const rows = items.map((item) => ({
    organization_id: session.organizationId,
    batch_id: batchId,
    row_number: item.rowNumber,
    synthetic_key: item.syntheticKey,
    normalized: item.normalized as unknown as Record<string, unknown>,
    action: item.action,
    reason: item.reason,
    suggested_deals: item.suggestedDeals as unknown as Record<string, unknown>[],
    status: "pending" as const,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("import_conflicts").insert(rows);

  // Batch: conflicts_count + status auf 'partial' setzen
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("import_batches")
    .update({ conflicts_count: items.length, status: "partial" })
    .eq("id", batchId)
    .eq("organization_id", session.organizationId);
}

// =============================================================================
// loadPendingConflicts — offene Konflikte der Org laden
// =============================================================================

export async function loadPendingConflicts(): Promise<ImportConflict[]> {
  const session = await requireRole("admin");
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("import_conflicts")
    .select("*")
    .eq("organization_id", session.organizationId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(100);

  if (error || !data) return [];

  return (data as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    batchId: row.batch_id as string,
    rowNumber: row.row_number as number | null,
    syntheticKey: row.synthetic_key as string,
    action: row.action as string,
    reason: row.reason as string,
    normalized: row.normalized as NormalizedImportRow,
    suggestedDeals: (row.suggested_deals as FuzzyMatch[]) ?? [],
    status: row.status as "pending" | "resolved" | "skipped",
    resolvedDealId: (row.resolved_deal_id as string | null) ?? null,
    createdAt: row.created_at as string,
  }));
}

// =============================================================================
// resolveConflictAssign — bestehenden Deal zuordnen
// =============================================================================

/**
 * Ordnet den Konflikt einem bestehenden Deal zu und führt die Zahlungs-
 * Markierung aus (mark_paid_one_time oder mark_paid_installment).
 */
export async function resolveConflictAssign(
  conflictId: string,
  dealId: string,
): Promise<{ error: string | null }> {
  const session = await requireRole("admin");
  const supabase = await createClient();
  const { organizationId, userId } = session;

  // Conflict laden
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: conflict } = await (supabase as any)
    .from("import_conflicts")
    .select("normalized, action")
    .eq("id", conflictId)
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .single();

  if (!conflict) return { error: "Konflikt nicht gefunden." };

  const n = conflict.normalized as NormalizedImportRow;

  // Zahlung markieren
  let payError: string | null = null;

  if (n.planType === "one_time") {
    const { error } = await supabase
      .from("one_time_payments")
      .update({ paid: true, paid_at: new Date().toISOString() })
      .eq("deal_id", dealId)
      .eq("organization_id", organizationId)
      .eq("paid", false);
    payError = error?.message ?? null;
  } else if (n.installmentSequence !== null) {
    const { error } = await supabase
      .from("installments")
      .update({ paid: true, paid_at: new Date().toISOString() })
      .eq("deal_id", dealId)
      .eq("organization_id", organizationId)
      .eq("sequence", n.installmentSequence)
      .eq("paid", false);
    payError = error?.message ?? null;
  } else {
    // Digistore: alle offenen Raten markieren
    const { error } = await supabase
      .from("installments")
      .update({ paid: true, paid_at: new Date().toISOString() })
      .eq("deal_id", dealId)
      .eq("organization_id", organizationId)
      .eq("paid", false);
    payError = error?.message ?? null;
  }

  if (payError) return { error: payError };

  // Conflict auflösen
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("import_conflicts")
    .update({
      status: "resolved",
      resolved_deal_id: dealId,
      resolved_by: userId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", conflictId)
    .eq("organization_id", organizationId);

  revalidatePath("/import/konflikte");
  revalidatePath("/import");
  revalidatePath("/deals");
  return { error: null };
}

// =============================================================================
// resolveConflictCreateDeal — neuen Deal aus Konflikt-Zeile anlegen
// =============================================================================

export async function resolveConflictCreateDeal(
  conflictId: string,
): Promise<{ error: string | null }> {
  const session = await requireRole("admin");
  const supabase = await createClient();
  const { organizationId, userId } = session;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: conflict } = await (supabase as any)
    .from("import_conflicts")
    .select("normalized")
    .eq("id", conflictId)
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .single();

  if (!conflict) return { error: "Konflikt nicht gefunden." };

  const n = conflict.normalized as NormalizedImportRow;
  const dbOrderId = n.externalOrderId.startsWith("legacy-") ? null : n.externalOrderId;

  // Plattform-ID aus platforms-Tabelle
  let platformId: string | null = null;
  if (n.platformRawName) {
    const { data: plat } = await supabase
      .from("platforms")
      .select("id")
      .eq("organization_id", organizationId)
      .ilike("name", n.platformRawName)
      .maybeSingle();
    platformId = plat?.id ?? null;
  }

  const { data: deal, error: dealErr } = await supabase
    .from("deals")
    .insert({
      organization_id: organizationId,
      created_by: userId,
      customer_name: n.customerName !== "Unbekannt" ? n.customerName : "Unbekannt – bitte ergänzen",
      order_id: dbOrderId,
      platform_id: platformId,
      total_price: n.amount,
      payment_type: n.planType === "one_time" ? "one_time" : "installments",
      close_date: n.eventDate,
    })
    .select("id")
    .single();

  if (dealErr || !deal) return { error: dealErr?.message ?? "Deal konnte nicht angelegt werden." };

  // Zahlung sofort als bezahlt anlegen
  if (n.planType === "one_time") {
    await supabase.from("one_time_payments").insert({
      deal_id: deal.id,
      organization_id: organizationId,
      due_date: n.eventDate,
      paid: true,
      paid_at: new Date().toISOString(),
    });
  } else if (n.installmentSequence !== null) {
    await supabase.from("installments").insert({
      deal_id: deal.id,
      organization_id: organizationId,
      sequence: n.installmentSequence,
      due_date: n.eventDate,
      amount: n.amount,
      paid: true,
      paid_at: new Date().toISOString(),
    });
  }

  // Conflict auflösen
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("import_conflicts")
    .update({
      status: "resolved",
      resolved_deal_id: deal.id,
      resolved_by: userId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", conflictId)
    .eq("organization_id", organizationId);

  revalidatePath("/import/konflikte");
  revalidatePath("/import");
  revalidatePath("/deals");
  return { error: null };
}

// =============================================================================
// resolveConflictSkip — Konflikt überspringen
// =============================================================================

export async function resolveConflictSkip(
  conflictId: string,
): Promise<{ error: string | null }> {
  const session = await requireRole("admin");
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("import_conflicts")
    .update({
      status: "skipped",
      resolved_by: session.userId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", conflictId)
    .eq("organization_id", session.organizationId)
    .eq("status", "pending");

  if (error) return { error: error.message };

  revalidatePath("/import/konflikte");
  revalidatePath("/import");
  return { error: null };
}

// =============================================================================
// searchDealsForAssignment — Deals für Konflikt-Zuordnung suchen
// =============================================================================

export async function searchDealsForAssignment(
  query: string,
): Promise<Array<{ id: string; customer_name: string; order_id: string | null; total_price: number }>> {
  if (!query || query.trim().length < 2) return [];
  const session = await requireRole("admin");
  const supabase = await createClient();

  const { data } = await supabase
    .from("deals")
    .select("id, customer_name, order_id, total_price")
    .eq("organization_id", session.organizationId)
    .ilike("customer_name", `%${query.trim()}%`)
    .order("customer_name")
    .limit(10);

  return data ?? [];
}

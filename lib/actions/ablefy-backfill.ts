"use server";

import { requireRole } from "@/lib/auth/get-current-org";
import { fetchAllAblefyOrders, ablefyOrderToNormalizedRows } from "@/lib/webhooks/ablefy-api-client";
import { processWebhookEvent } from "@/lib/webhooks/process-webhook-event";
import { createAdminClient } from "@/lib/supabase/admin";

export type BackfillResult = {
  success: boolean;
  message: string;
  total: number;
  processed: number;
  skipped: number;
  errors: string[];
};

export async function runAblefyBackfill(): Promise<BackfillResult> {
  const session = await requireRole("admin");
  const organizationId = session.organizationId;

  const supabase = createAdminClient();

  // Bereits importierte syntheticKeys laden → Duplikate überspringen
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingRows } = await (supabase as any)
    .from("import_rows")
    .select("synthetic_key")
    .eq("organization_id", organizationId);

  const alreadyImported = new Set<string>(
    (existingRows ?? []).map((r: { synthetic_key: string }) => r.synthetic_key),
  );

  // Alle Ablefy-Bestellungen abrufen
  let orders;
  try {
    orders = await fetchAllAblefyOrders();
  } catch (err) {
    return {
      success: false,
      message: `Ablefy API nicht erreichbar: ${err}`,
      total: 0,
      processed: 0,
      skipped: 0,
      errors: [String(err)],
    };
  }

  let total = 0;
  let processed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const order of orders) {
    const rows = ablefyOrderToNormalizedRows(order);

    for (const row of rows) {
      total++;

      if (alreadyImported.has(row.syntheticKey)) {
        skipped++;
        continue;
      }

      try {
        await processWebhookEvent(row, organizationId);
        alreadyImported.add(row.syntheticKey);
        processed++;
      } catch (err) {
        errors.push(`Bestellung ${row.externalOrderId}: ${err}`);
      }
    }
  }

  return {
    success: true,
    message: `${processed} importiert, ${skipped} bereits vorhanden, ${errors.length} Fehler`,
    total,
    processed,
    skipped,
    errors,
  };
}

import { NextRequest, NextResponse } from "next/server";
import { fetchAllAblefyOrders, ablefyOrderToNormalizedRows } from "@/lib/webhooks/ablefy-api-client";
import { processWebhookEvent } from "@/lib/webhooks/process-webhook-event";
import { createAdminClient } from "@/lib/supabase/admin";

// =============================================================================
// GET /api/admin/ablefy-backfill
//
// Einmaliger historischer Import aller Ablefy-Bestellungen.
// Nur aufrufbar mit dem Admin-Secret-Header.
//
// Aufruf: GET https://kalaie-ledger.com/api/admin/ablefy-backfill
//         Header: x-admin-secret: <ADMIN_SECRET>
// =============================================================================

const ADMIN_SECRET = process.env.ADMIN_SECRET;
const ABLEFY_ORG_ID = process.env.ABLEFY_ORG_ID!;

export async function GET(request: NextRequest) {
  // Sicherheits-Check
  const secret = request.headers.get("x-admin-secret");
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  if (!ABLEFY_ORG_ID) {
    return NextResponse.json({ error: "ABLEFY_ORG_ID nicht gesetzt" }, { status: 500 });
  }

  const supabase = createAdminClient();

  // Bereits importierte syntheticKeys laden (Duplikate vermeiden)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingRows } = await (supabase as any)
    .from("import_rows")
    .select("synthetic_key")
    .eq("organization_id", ABLEFY_ORG_ID);

  const alreadyImported = new Set<string>(
    (existingRows ?? []).map((r: { synthetic_key: string }) => r.synthetic_key),
  );

  // Alle Ablefy-Bestellungen abrufen
  let orders;
  try {
    orders = await fetchAllAblefyOrders();
  } catch (err) {
    return NextResponse.json({ error: `Ablefy API Fehler: ${err}` }, { status: 502 });
  }

  const results = {
    total: 0,
    processed: 0,
    skipped: 0,
    errors: [] as string[],
  };

  // Jede Bestellung verarbeiten
  for (const order of orders) {
    const rows = ablefyOrderToNormalizedRows(order);

    for (const row of rows) {
      results.total++;

      // Duplikat-Check
      if (alreadyImported.has(row.syntheticKey)) {
        results.skipped++;
        continue;
      }

      try {
        await processWebhookEvent(row, ABLEFY_ORG_ID);
        alreadyImported.add(row.syntheticKey);
        results.processed++;
      } catch (err) {
        results.errors.push(`Order ${row.externalOrderId}: ${err}`);
      }
    }
  }

  return NextResponse.json({
    success: true,
    message: `Backfill abgeschlossen: ${results.processed} importiert, ${results.skipped} übersprungen, ${results.errors.length} Fehler`,
    ...results,
  });
}

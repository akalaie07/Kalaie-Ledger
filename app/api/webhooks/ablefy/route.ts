import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { parseAblefyWebhook } from "@/lib/webhooks/ablefy-parser";
import { processWebhookEvent } from "@/lib/webhooks/process-webhook-event";

// =============================================================================
// POST /api/webhooks/ablefy
//
// Empfängt Ablefy IPN-Events, verifiziert die Signatur und verarbeitet sie.
// URL wird in Ablefy unter: Einstellungen → Integrationen → ablefy API → Webhook-URL eingetragen.
// =============================================================================

const ABLEFY_WEBHOOK_SECRET = process.env.ABLEFY_WEBHOOK_SECRET!;
const ABLEFY_ORG_ID = process.env.ABLEFY_ORG_ID!;

function verifySignature(rawBody: string, signatureHeader: string): boolean {
  if (!ABLEFY_WEBHOOK_SECRET || !signatureHeader) return false;
  try {
    const expected = createHmac("sha256", ABLEFY_WEBHOOK_SECRET)
      .update(rawBody, "utf8")
      .digest("hex");
    // Signatur kann mit "sha256=" Prefix kommen
    const received = signatureHeader.replace(/^sha256=/, "");
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(received, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!ABLEFY_ORG_ID) {
    console.error("[Ablefy Webhook] ABLEFY_ORG_ID ist nicht gesetzt.");
    return NextResponse.json({ error: "Server-Konfigurationsfehler" }, { status: 500 });
  }

  const rawBody = await request.text();

  // Signatur prüfen — Ablefy Header-Name kann variieren
  const signatureHeader =
    request.headers.get("x-ablefy-signature") ??
    request.headers.get("x-webhook-signature") ??
    request.headers.get("signature") ??
    "";

  if (ABLEFY_WEBHOOK_SECRET && !verifySignature(rawBody, signatureHeader)) {
    console.warn("[Ablefy Webhook] Ungültige Signatur — Event abgelehnt.");
    return NextResponse.json({ error: "Ungültige Signatur" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON" }, { status: 400 });
  }

  const normalized = parseAblefyWebhook(payload);
  if (!normalized) {
    // Event ohne Bestell-ID — ignorieren (z.B. ping/test-events)
    return NextResponse.json({ received: true, skipped: true });
  }

  try {
    const result = await processWebhookEvent(normalized, ABLEFY_ORG_ID);
    console.log(`[Ablefy Webhook] ${normalized.externalOrderId} → ${result.action}`);
    return NextResponse.json({ received: true, action: result.action });
  } catch (err) {
    console.error("[Ablefy Webhook] Fehler bei der Verarbeitung:", err);
    // 200 zurückgeben damit Ablefy nicht wiederholt sendet
    return NextResponse.json({ received: true, error: "Interner Fehler — wird geloggt" });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { parseCopecartWebhook } from "@/lib/webhooks/copecart-parser";
import { processWebhookEvent } from "@/lib/webhooks/process-webhook-event";

// =============================================================================
// POST /api/webhooks/copecart
//
// Empfängt Copecart IPN-Events, verifiziert die Signatur und verarbeitet sie.
// URL wird in Copecart unter: Einstellungen → Integrationen → Webhooks eingetragen.
// =============================================================================

const COPECART_WEBHOOK_SECRET = process.env.COPECART_WEBHOOK_SECRET!;
const COPECART_ORG_ID = process.env.COPECART_ORG_ID!;

function verifySignature(rawBody: string, signatureHeader: string): boolean {
  if (!COPECART_WEBHOOK_SECRET || !signatureHeader) return false;
  try {
    const expected = createHmac("sha256", COPECART_WEBHOOK_SECRET)
      .update(rawBody, "utf8")
      .digest("hex");
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
  if (!COPECART_ORG_ID) {
    console.error("[Copecart Webhook] COPECART_ORG_ID ist nicht gesetzt.");
    return NextResponse.json({ error: "Server-Konfigurationsfehler" }, { status: 500 });
  }

  const rawBody = await request.text();

  // Signatur prüfen — Copecart Header-Name kann variieren
  const signatureHeader =
    request.headers.get("x-copecart-signature") ??
    request.headers.get("x-webhook-signature") ??
    request.headers.get("x-signature") ??
    request.headers.get("signature") ??
    "";

  if (COPECART_WEBHOOK_SECRET && !verifySignature(rawBody, signatureHeader)) {
    console.warn("[Copecart Webhook] Ungültige Signatur — Event abgelehnt.");
    return NextResponse.json({ error: "Ungültige Signatur" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON" }, { status: 400 });
  }

  const normalized = parseCopecartWebhook(payload);
  if (!normalized) {
    // Event ohne Bestell-ID — ignorieren (z.B. ping/test-events)
    return NextResponse.json({ received: true, skipped: true });
  }

  try {
    const result = await processWebhookEvent(normalized, COPECART_ORG_ID);
    console.log(`[Copecart Webhook] ${normalized.externalOrderId} → ${result.action}`);
    return NextResponse.json({ received: true, action: result.action });
  } catch (err) {
    console.error("[Copecart Webhook] Fehler bei der Verarbeitung:", err);
    // 200 zurückgeben damit Copecart nicht wiederholt sendet
    return NextResponse.json({ received: true, error: "Interner Fehler — wird geloggt" });
  }
}

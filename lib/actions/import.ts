"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/get-current-org";
import { parseDate } from "@/lib/utils/parse";

// =============================================================================
// Typen
// =============================================================================

export type ImportRow = {
  customer_name: string;
  order_id?: string;
  platform_name?: string;
  product_name?: string;
  payment_method?: string;
  closer_name?: string;
  sales_partner_name?: string;
  total_price: string;
  payment_type: string;
  close_date: string;
  number_of_rates?: string;
  first_due_date?: string;
  onboarding_done?: string;
  update_call_done?: string;
  inkasso_required?: string;
  notes?: string;
  /** Bezahlte Raten: "ja"/"nein" für EZ, Zahl ("2") für RZ = erste N Raten sind bezahlt */
  bezahlt_raten?: string;
};

export type ImportResult = {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
};

// Typ für Platform-Export Zeilen (Copecart / Digistore / Ablefy)
export type AbgleichRow = {
  order_id: string;
  platform: "copecart" | "digistore" | "ablefy";
  status: "paid" | "refunded" | "failed";
  installment_sequence?: number;
  // Optionale Felder für Vorschau-Tabelle
  customer_name?: string;
  product_name?: string;
  amount?: number;
};

export type AbgleichResult = {
  updated: number;
  skipped: number;
  created: number;
  notFound: string[];
  errors: string[];
};

// =============================================================================
// Parser-Hilfsfunktionen (parseDate kommt aus @/lib/utils/parse)
// =============================================================================

function parsePrice(val: string): number | null {
  const clean = val.replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

function parseBool(val: string): boolean {
  return ["ja", "yes", "1", "true", "x", "✓"].includes((val ?? "").toLowerCase().trim());
}

function parsePaymentType(val: string): "one_time" | "installments" | null {
  const v = (val ?? "").toLowerCase().trim();
  if (v === "one_time" || v.includes("einmal") || v === "ez") return "one_time";
  if (v === "installments" || v.includes("rate") || v.includes("raten") || v === "rz") return "installments";
  return null;
}

// =============================================================================
// importDeals — Smarter Upsert Import für eigene Excel/CSV
// =============================================================================

export async function importDeals(rows: ImportRow[]): Promise<ImportResult> {
  const session = await getCurrentSession();
  if (!session) throw new Error("Nicht angemeldet.");
  if (session.role !== "admin") throw new Error("Nur Admins können Deals importieren.");

  const supabase = await createClient();

  // Lookup-Daten für diese Org laden
  const [{ data: platforms }, { data: products }, { data: closers }, { data: partners }] =
    await Promise.all([
      supabase.from("platforms").select("id, name").eq("organization_id", session.organizationId),
      supabase.from("products").select("id, name").eq("organization_id", session.organizationId),
      supabase.from("closers").select("id, name").eq("organization_id", session.organizationId),
      supabase.from("sales_partners").select("id, name").eq("organization_id", session.organizationId),
    ]);

  function findId(list: { id: string; name: string }[] | null, name: string | undefined): string | null {
    if (!name || !list) return null;
    const needle = name.trim().toLowerCase();
    return list.find((x) => x.name.toLowerCase() === needle)?.id ?? null;
  }

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowLabel = `Zeile ${i + 2}`;

    if (!row.customer_name?.trim()) {
      errors.push(`${rowLabel}: Kundenname fehlt.`);
      skipped++;
      continue;
    }

    const close_date = parseDate(row.close_date) ?? new Date().toISOString().slice(0, 10);

    const total_price = parsePrice(row.total_price ?? "");
    if (total_price === null || total_price < 0) {
      errors.push(`${rowLabel} (${row.customer_name}): Ungültiger Preis.`);
      skipped++;
      continue;
    }

    const payment_type = parsePaymentType(row.payment_type ?? "");
    if (!payment_type) {
      errors.push(`${rowLabel} (${row.customer_name}): Zahlungsart muss "Einmalzahlung"/"EZ" oder "Ratenzahlung"/"RZ" sein.`);
      skipped++;
      continue;
    }

    const platform_id = findId(platforms, row.platform_name);
    const product_id = findId(products, row.product_name);
    const closer_id = findId(closers, row.closer_name);
    const sales_partner_id = findId(partners, row.sales_partner_name);

    // ─── Prüfen ob Deal bereits existiert (anhand order_id) ─────────────────
    const order_id = row.order_id?.trim() || null;
    let existingDeal: { id: string; payment_type: string } | null = null;

    if (order_id) {
      const { data: found } = await supabase
        .from("deals")
        .select("id, payment_type")
        .eq("organization_id", session.organizationId)
        .eq("order_id", order_id)
        .maybeSingle();
      existingDeal = found ?? null;
    }

    if (existingDeal) {
      // ─── UPDATE: Bestehenden Deal aktualisieren ──────────────────────────
      const { error: updateErr } = await supabase
        .from("deals")
        .update({
          customer_name: row.customer_name.trim(),
          platform_id,
          product_id,
          closer_id,
          sales_partner_id,
          total_price,
          payment_type,
          close_date,
          ...(row.notes?.trim() ? { notes: row.notes.trim() } : {}),
          ...(row.payment_method?.trim() ? { payment_method: row.payment_method.trim() } : {}),
        })
        .eq("id", existingDeal.id)
        .eq("organization_id", session.organizationId);

      if (updateErr) {
        errors.push(`${rowLabel} (${row.customer_name}): Update fehlgeschlagen — ${updateErr.message}`);
        skipped++;
        continue;
      }

      // Zahlungsstatus setzen falls bezahlt_raten angegeben
      if (row.bezahlt_raten) {
        await applyPaymentStatus(
          supabase,
          existingDeal.id,
          session.organizationId,
          payment_type,
          row.bezahlt_raten,
        );
      }

      updated++;
    } else {
      // ─── INSERT: Neuen Deal anlegen ──────────────────────────────────────
      const { data: deal, error: dealErr } = await supabase
        .from("deals")
        .insert({
          organization_id: session.organizationId,
          created_by: session.userId,
          customer_name: row.customer_name.trim(),
          order_id,
          platform_id,
          product_id,
          payment_method: row.payment_method?.trim() || null,
          closer_id,
          sales_partner_id,
          total_price,
          payment_type,
          close_date,
          onboarding_done: parseBool(row.onboarding_done ?? ""),
          update_call_done: parseBool(row.update_call_done ?? ""),
          inkasso_required: parseBool(row.inkasso_required ?? ""),
          notes: row.notes?.trim() || null,
        })
        .select("id")
        .single();

      if (dealErr || !deal) {
        errors.push(`${rowLabel} (${row.customer_name}): ${dealErr?.message ?? "Unbekannter Fehler."}`);
        skipped++;
        continue;
      }

      // Zahlungs-Records anlegen
      if (payment_type === "one_time") {
        await supabase.from("one_time_payments").insert({
          deal_id: deal.id,
          organization_id: session.organizationId,
        });
      } else {
        const nRates = parseInt(row.number_of_rates ?? "");
        const firstDue = parseDate(row.first_due_date ?? "");
        if (nRates >= 2 && firstDue) {
          const base = Math.floor((total_price / nRates) * 100) / 100;
          const last = Math.round((total_price - base * (nRates - 1)) * 100) / 100;
          const installments = Array.from({ length: nRates }, (_, k) => {
            const d = new Date(firstDue);
            d.setMonth(d.getMonth() + k);
            return {
              deal_id: deal.id,
              organization_id: session.organizationId,
              sequence: k + 1,
              due_date: d.toISOString().slice(0, 10),
              amount: k === nRates - 1 ? last : base,
            };
          });
          await supabase.from("installments").insert(installments);
        }
      }

      // Zahlungsstatus direkt setzen wenn angegeben
      if (row.bezahlt_raten) {
        await applyPaymentStatus(
          supabase,
          deal.id,
          session.organizationId,
          payment_type,
          row.bezahlt_raten,
        );
      }

      imported++;
    }
  }

  revalidatePath("/deals");
  return { imported, updated, skipped, errors };
}

// =============================================================================
// applyPaymentStatus — Zahlungsstatus setzen
// =============================================================================

async function applyPaymentStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  dealId: string,
  orgId: string,
  paymentType: string,
  bezahltRaten: string,
) {
  if (paymentType === "one_time") {
    if (parseBool(bezahltRaten)) {
      await supabase
        .from("one_time_payments")
        .update({ paid: true, paid_at: new Date().toISOString() })
        .eq("deal_id", dealId)
        .eq("organization_id", orgId)
        .eq("paid", false);
    }
  } else {
    // Ratenzahlung: Zahl = Anzahl bezahlter Raten (erste N Raten markieren)
    const count = parseInt(bezahltRaten, 10);
    if (!isNaN(count) && count > 0) {
      // Erste N Raten als bezahlt markieren
      for (let seq = 1; seq <= count; seq++) {
        await supabase
          .from("installments")
          .update({ paid: true, paid_at: new Date().toISOString() })
          .eq("deal_id", dealId)
          .eq("organization_id", orgId)
          .eq("sequence", seq)
          .eq("paid", false);
      }
    } else if (parseBool(bezahltRaten)) {
      // "ja" = alle Raten bezahlt
      await supabase
        .from("installments")
        .update({ paid: true, paid_at: new Date().toISOString() })
        .eq("deal_id", dealId)
        .eq("organization_id", orgId)
        .eq("paid", false);
    }
  }
}

// =============================================================================
// processPaymentExport — Platform-Export (Copecart / Digistore / Ablefy)
// Übernommen und integriert aus zahlungsabgleich.ts
// =============================================================================

export async function processPaymentExport(rows: AbgleichRow[]): Promise<AbgleichResult> {
  const session = await getCurrentSession();
  if (!session) return { updated: 0, skipped: 0, created: 0, notFound: [], errors: ["Nicht angemeldet."] };

  const supabase = await createClient();

  const paidRows = rows.filter((r) => r.status === "paid");
  if (paidRows.length === 0) return { updated: 0, skipped: rows.length, created: 0, notFound: [], errors: [] };

  const orderIds = [...new Set(paidRows.map((r) => r.order_id))];

  const { data: deals } = await supabase
    .from("deals")
    .select("id, order_id, payment_type")
    .eq("organization_id", session.organizationId)
    .in("order_id", orderIds);

  const dealMap = new Map<string, { id: string; payment_type: string }>();
  for (const d of deals ?? []) {
    if (d.order_id) dealMap.set(d.order_id, { id: d.id, payment_type: d.payment_type });
  }

  const { data: platforms } = await supabase
    .from("platforms")
    .select("id, name")
    .eq("organization_id", session.organizationId);

  const platformIdMap = new Map<string, string>();
  for (const p of platforms ?? []) {
    platformIdMap.set(p.name.toLowerCase(), p.id);
  }

  const notFound: string[] = [];
  const errors: string[] = [];
  let updated = 0;
  let skipped = 0;
  let created = 0;

  for (const row of paidRows) {
    let deal = dealMap.get(row.order_id);

    if (!deal) {
      const hasSequence = !!row.installment_sequence;
      const platformName = row.platform;
      const platformId = platformIdMap.get(platformName) ?? null;

      const { data: newDeal, error: createError } = await supabase
        .from("deals")
        .insert({
          organization_id: session.organizationId,
          created_by: session.userId,
          customer_name: "Unbekannt – bitte ergänzen",
          order_id: row.order_id,
          platform_id: platformId,
          total_price: 0,
          payment_type: hasSequence ? "installments" : "one_time",
          close_date: new Date().toISOString().slice(0, 10),
        })
        .select("id, payment_type")
        .single();

      if (createError || !newDeal) {
        errors.push(`${row.order_id}: Deal konnte nicht angelegt werden.`);
        if (!notFound.includes(row.order_id)) notFound.push(row.order_id);
        continue;
      }

      created++;
      deal = { id: newDeal.id, payment_type: newDeal.payment_type };
      dealMap.set(row.order_id, deal);

      if (deal.payment_type === "one_time") {
        await supabase.from("one_time_payments").insert({
          deal_id: newDeal.id,
          organization_id: session.organizationId,
          due_date: null,
        });
      } else if (hasSequence) {
        await supabase.from("installments").insert({
          deal_id: newDeal.id,
          organization_id: session.organizationId,
          sequence: row.installment_sequence!,
          due_date: new Date().toISOString().slice(0, 10),
          amount: 0,
        });
      }
    }

    if (deal.payment_type === "one_time") {
      const { error } = await supabase
        .from("one_time_payments")
        .update({ paid: true, paid_at: new Date().toISOString() })
        .eq("deal_id", deal.id)
        .eq("organization_id", session.organizationId)
        .eq("paid", false);

      if (error) errors.push(`${row.order_id}: ${error.message}`);
      else updated++;
    } else {
      if (row.installment_sequence) {
        const { error } = await supabase
          .from("installments")
          .update({ paid: true, paid_at: new Date().toISOString() })
          .eq("deal_id", deal.id)
          .eq("organization_id", session.organizationId)
          .eq("sequence", row.installment_sequence)
          .eq("paid", false);

        if (error) errors.push(`${row.order_id} Rate ${row.installment_sequence}: ${error.message}`);
        else updated++;
      } else {
        const { error } = await supabase
          .from("installments")
          .update({ paid: true, paid_at: new Date().toISOString() })
          .eq("deal_id", deal.id)
          .eq("organization_id", session.organizationId)
          .eq("paid", false);

        if (error) errors.push(`${row.order_id}: ${error.message}`);
        else updated++;
      }
    }
  }

  skipped = rows.length - paidRows.length;

  revalidatePath("/deals");
  revalidatePath("/import");

  return { updated, skipped, created, notFound, errors };
}

"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/get-current-org";
import { parseDate } from "@/lib/utils/parse";
import { normName } from "@/lib/import/fuzzy";
import { buildResolveMap } from "@/lib/import/resolve";

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
  // Anreicherungsfelder (Vorschau + Smart-Import)
  customer_name?: string;
  product_name?: string;
  amount?: number;           // Betrag dieser Transaktion (eine Rate oder Einmalzahlung)
  date?: string;             // Transaktionsdatum → close_date bei Auto-Deals
  total_installments?: number; // Gesamtanzahl Raten (aus Zahlungsplan z.B. "12 Raten")
  payment_plan?: "one_time" | "installments"; // Erkannter Zahlungsplan
};

export type AbgleichResult = {
  updated: number;
  enriched: number;   // bestehende "Unbekannt"-Deals angereichert
  created: number;
  skipped: number;
  refunded: number;   // erstattete Transaktionen
  failed: number;     // fehlgeschlagene Transaktionen
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
  const [{ data: platforms }, { data: products }, { data: closers }] =
    await Promise.all([
      supabase.from("platforms").select("id, name").eq("organization_id", session.organizationId),
      supabase.from("products").select("id, name").eq("organization_id", session.organizationId),
      supabase.from("closers").select("id, name").eq("organization_id", session.organizationId),
    ]);

  function findId(list: { id: string; name: string }[] | null, name: string | undefined): string | null {
    if (!name || !list) return null;
    const needle = name.trim().toLowerCase();
    return list.find((x) => x.name.toLowerCase() === needle)?.id ?? null;
  }

  // Produkt-Aliase laden (Smart Import) → in der Vorschau bestätigte Zuordnungen
  // automatisch anwenden, sonst Fallback auf exakten Namen.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: productAliasesRaw } = await (supabase as any)
    .from("import_aliases")
    .select("raw_value, target_id")
    .eq("organization_id", session.organizationId)
    .eq("entity_type", "product");
  const productResolveMap = buildResolveMap(
    (products ?? []).map((p) => ({ id: p.id, name: p.name })),
    (productAliasesRaw ?? []).map((a: { raw_value: string; target_id: string }) => ({
      rawValue: a.raw_value,
      targetId: a.target_id,
    })),
  );
  const resolveProductId = (rawName: string | undefined): string | null => {
    if (!rawName) return null;
    return productResolveMap.get(normName(rawName)) ?? findId(products, rawName);
  };

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
    const product_id = resolveProductId(row.product_name);
    const closer_id = findId(closers, row.closer_name);

    // ─── Prüfen ob Deal bereits existiert (anhand order_id) ─────────────────
    const order_id = row.order_id?.trim() || null;
    let existingDeal: {
      id: string;
      payment_type: string;
      customer_name: string;
      platform_id: string | null;
      product_id: string | null;
      closer_id: string | null;
      total_price: number;
      notes: string | null;
      payment_method: string | null;
    } | null = null;

    if (order_id) {
      const { data: found } = await supabase
        .from("deals")
        .select(
          "id, payment_type, customer_name, platform_id, product_id, closer_id, total_price, notes, payment_method",
        )
        .eq("organization_id", session.organizationId)
        .eq("order_id", order_id)
        .maybeSingle();
      existingDeal = found ?? null;
    }

    if (existingDeal) {
      // ─── UPDATE: Bestehenden Deal NUR ERGÄNZEN (leere Felder füllen) ─────
      // Ein erneuter CSV-Import darf bereits gepflegte Daten NICHT verändern.
      // Es werden ausschließlich Felder gesetzt, die im bestehenden Deal noch
      // leer sind UND für die die CSV einen echten Wert liefert. Vorhandene
      // Werte (Closer, Produkt, Preis, Name …) bleiben unangetastet.
      const isPlaceholderName =
        !existingDeal.customer_name.trim() ||
        existingDeal.customer_name === "Unbekannt" ||
        existingDeal.customer_name === "Unbekannt – bitte ergänzen";

      const updatePayload: {
        customer_name?: string;
        platform_id?: string;
        product_id?: string;
        closer_id?: string;
        total_price?: number;
        notes?: string;
        payment_method?: string;
      } = {};

      if (isPlaceholderName && row.customer_name.trim()) updatePayload.customer_name = row.customer_name.trim();
      if (!existingDeal.platform_id && platform_id) updatePayload.platform_id = platform_id;
      if (!existingDeal.product_id && product_id) updatePayload.product_id = product_id;
      if (!existingDeal.closer_id && closer_id) updatePayload.closer_id = closer_id;
      if (existingDeal.total_price === 0 && total_price > 0) updatePayload.total_price = total_price;
      if (!existingDeal.notes?.trim() && row.notes?.trim()) updatePayload.notes = row.notes.trim();
      if (!existingDeal.payment_method?.trim() && row.payment_method?.trim())
        updatePayload.payment_method = row.payment_method.trim();
      // close_date wird nie geändert: es ist immer gesetzt (Pflichtfeld), also nie "leer".

      // payment_type wird bei bestehenden Deals bewusst NICHT automatisch geändert:
      // ein Wechsel würde bestehende Raten / Einmalzahlungen verwaisen lassen.
      if (payment_type !== existingDeal.payment_type) {
        errors.push(
          `${rowLabel} (${row.customer_name}): Zahlungsart-Wechsel (${existingDeal.payment_type} → ${payment_type}) übersprungen — bitte bei Bedarf manuell im Deal ändern.`,
        );
      }

      if (Object.keys(updatePayload).length > 0) {
        const { error: updateErr } = await supabase
          .from("deals")
          .update(updatePayload)
          .eq("id", existingDeal.id)
          .eq("organization_id", session.organizationId);

        if (updateErr) {
          errors.push(`${rowLabel} (${row.customer_name}): Update fehlgeschlagen — ${updateErr.message}`);
          skipped++;
          continue;
        }
      }

      // Zahlungsstatus setzen falls bezahlt_raten angegeben — anhand der
      // BESTEHENDEN Zahlungsart, nicht der aus der CSV.
      if (row.bezahlt_raten) {
        await applyPaymentStatus(
          supabase,
          existingDeal.id,
          session.organizationId,
          existingDeal.payment_type,
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
// processPaymentExport — Smart Platform-Import (Copecart / Digistore / Ablefy)
// =============================================================================

/** Fuzzy-Produktname-Matching: findet das beste Produkt anhand Teil-Übereinstimmung */
function findProductId(
  products: { id: string; name: string }[] | null,
  rawName: string | undefined,
): string | null {
  if (!rawName || !products?.length) return null;
  const needle = rawName.toLowerCase().replace(/[^a-z0-9äöüß]/g, "");
  const exact = products.find((p) => p.name.toLowerCase() === rawName.toLowerCase());
  if (exact) return exact.id;
  const partial = products.find((p) => {
    const hay = p.name.toLowerCase().replace(/[^a-z0-9äöüß]/g, "");
    return needle.includes(hay) || hay.includes(needle);
  });
  return partial?.id ?? null;
}

export async function processPaymentExport(rows: AbgleichRow[]): Promise<AbgleichResult> {
  const session = await getCurrentSession();
  if (!session) return {
    updated: 0, enriched: 0, created: 0, skipped: 0, refunded: 0, failed: 0, notFound: [], errors: ["Nicht angemeldet."],
  };
  if (session.role !== "admin") return {
    updated: 0, enriched: 0, created: 0, skipped: 0, refunded: 0, failed: 0, notFound: [], errors: ["Nur Admins können Zahlungsimporte ausführen."],
  };

  const supabase = await createClient();

  let updated = 0;
  let enriched = 0;
  let created = 0;
  const notFound: string[] = [];
  const errors: string[] = [];

  // ─── Transaktionen aufschlüsseln ──────────────────────────────────────────
  const paidRows = rows.filter((r) => r.status === "paid");
  const refunded = rows.filter((r) => r.status === "refunded").length;
  const failed = rows.filter((r) => r.status === "failed").length;

  if (paidRows.length === 0) {
    return { updated: 0, enriched: 0, created: 0, skipped: rows.length, refunded, failed, notFound: [], errors: [] };
  }

  const orderIds = [...new Set(paidRows.map((r) => r.order_id))];

  // ─── Lookup-Daten laden ───────────────────────────────────────────────────
  const [{ data: existingDeals }, { data: platforms }, { data: products }] = await Promise.all([
    supabase
      .from("deals")
      .select("id, order_id, payment_type, customer_name, total_price, product_id")
      .eq("organization_id", session.organizationId)
      .in("order_id", orderIds),
    supabase.from("platforms").select("id, name").eq("organization_id", session.organizationId),
    supabase.from("products").select("id, name").eq("organization_id", session.organizationId),
  ]);

  type DealRecord = { id: string; payment_type: string; customer_name: string; total_price: number; product_id: string | null };
  const dealMap = new Map<string, DealRecord>();
  for (const d of existingDeals ?? []) {
    if (d.order_id) dealMap.set(d.order_id, d as DealRecord);
  }

  const platformIdMap = new Map<string, string>();
  for (const p of platforms ?? []) {
    platformIdMap.set(p.name.toLowerCase(), p.id);
  }

  // ─── Pro order_id alle Rows sammeln (für Kontext) ─────────────────────────
  const rowsByOrder = new Map<string, AbgleichRow[]>();
  for (const r of paidRows) {
    if (!rowsByOrder.has(r.order_id)) rowsByOrder.set(r.order_id, []);
    rowsByOrder.get(r.order_id)!.push(r);
  }

  // ─── Haupt-Verarbeitungs-Loop ─────────────────────────────────────────────
  for (const row of paidRows) {
    let deal = dealMap.get(row.order_id);
    const orderRows = rowsByOrder.get(row.order_id) ?? [row];

    if (!deal) {
      // ── Neuen Deal intelligent anlegen ────────────────────────────────────
      const platformId = platformIdMap.get(row.platform) ?? null;
      const productId = findProductId(products, row.product_name);

      const paymentPlan: "one_time" | "installments" =
        row.payment_plan ?? (row.total_installments || row.installment_sequence ? "installments" : "one_time");
      const totalInstallments = row.total_installments;
      const singleAmount = row.amount ?? 0;
      const totalPrice = totalInstallments && singleAmount > 0
        ? Math.round(singleAmount * totalInstallments * 100) / 100
        : singleAmount;
      const closeDate = row.date ?? new Date().toISOString().slice(0, 10);
      const customerName = row.customer_name?.trim() || "Unbekannt – bitte ergänzen";

      const { data: newDeal, error: createError } = await supabase
        .from("deals")
        .insert({
          organization_id: session.organizationId,
          created_by: session.userId,
          customer_name: customerName,
          order_id: row.order_id,
          platform_id: platformId,
          product_id: productId,
          total_price: totalPrice,
          payment_type: paymentPlan,
          close_date: closeDate,
        })
        .select("id, payment_type, customer_name, total_price, product_id")
        .single();

      if (createError || !newDeal) {
        errors.push(`${row.order_id}: Deal konnte nicht angelegt werden — ${createError?.message ?? "?"}`);
        if (!notFound.includes(row.order_id)) notFound.push(row.order_id);
        continue;
      }

      created++;
      deal = { id: newDeal.id, payment_type: newDeal.payment_type, customer_name: newDeal.customer_name, total_price: newDeal.total_price, product_id: newDeal.product_id };
      dealMap.set(row.order_id, deal);

      // Zahlungs-Records anlegen
      if (paymentPlan === "one_time") {
        await supabase.from("one_time_payments").insert({
          deal_id: newDeal.id,
          organization_id: session.organizationId,
          due_date: closeDate,
        });
      } else {
        // Alle bekannten Raten anlegen
        const maxSeq = totalInstallments
          ?? Math.max(...orderRows.map((r) => r.installment_sequence ?? 1));
        const rateAmount = totalInstallments && totalPrice > 0
          ? Math.round((totalPrice / totalInstallments) * 100) / 100
          : singleAmount;
        const installmentsToCreate = Array.from({ length: maxSeq }, (_, k) => ({
          deal_id: newDeal.id,
          organization_id: session.organizationId,
          sequence: k + 1,
          due_date: closeDate,
          amount: rateAmount,
        }));
        if (installmentsToCreate.length > 0) {
          await supabase.from("installments").insert(installmentsToCreate);
        }
      }
    } else {
      // ── Bestehenden Deal anreichern wenn Platzhalterwerte vorhanden ────────
      const isUnknown = deal.customer_name === "Unbekannt – bitte ergänzen";
      const needsEnrichment =
        (isUnknown && row.customer_name?.trim()) ||
        (deal.total_price === 0 && row.amount && row.amount > 0) ||
        (!deal.product_id && row.product_name);

      if (needsEnrichment) {
        const productId = !deal.product_id ? findProductId(products, row.product_name) : undefined;
        const totalInstallments = row.total_installments;
        const singleAmount = row.amount ?? 0;
        const newTotal = totalInstallments && singleAmount > 0
          ? Math.round(singleAmount * totalInstallments * 100) / 100
          : singleAmount;

        const shouldUpdateName = isUnknown && !!row.customer_name?.trim();
        const shouldUpdatePrice = deal.total_price === 0 && newTotal > 0;
        const shouldUpdateProduct = !!productId;

        if (shouldUpdateName || shouldUpdatePrice || shouldUpdateProduct) {
          await supabase.from("deals").update({
            ...(shouldUpdateName ? { customer_name: row.customer_name!.trim() } : {}),
            ...(shouldUpdatePrice ? { total_price: newTotal } : {}),
            ...(shouldUpdateProduct ? { product_id: productId } : {}),
          }).eq("id", deal.id).eq("organization_id", session.organizationId);
          enriched++;
        }
      }
    }

    // ── Zahlung als bezahlt markieren ────────────────────────────────────────
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
        // Prüfen ob Rate existiert
        const { data: existing } = await supabase
          .from("installments")
          .select("id, paid")
          .eq("deal_id", deal.id)
          .eq("organization_id", session.organizationId)
          .eq("sequence", row.installment_sequence)
          .maybeSingle();

        if (!existing) {
          await supabase.from("installments").insert({
            deal_id: deal.id,
            organization_id: session.organizationId,
            sequence: row.installment_sequence,
            due_date: row.date ?? new Date().toISOString().slice(0, 10),
            amount: row.amount ?? 0,
            paid: true,
            paid_at: new Date().toISOString(),
          });
          updated++;
        } else if (!existing.paid) {
          const { error } = await supabase
            .from("installments")
            .update({ paid: true, paid_at: new Date().toISOString() })
            .eq("id", existing.id);
          if (error) errors.push(`${row.order_id} Rate ${row.installment_sequence}: ${error.message}`);
          else updated++;
        }
        // Bereits bezahlt → still, kein Fehler
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

  const skipped = rows.length - paidRows.length;

  revalidatePath("/deals");
  revalidatePath("/import");

  return { updated, enriched, created, skipped, refunded, failed, notFound, errors };
}

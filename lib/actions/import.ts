"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/get-current-org";

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
};

export type ImportResult = {
  imported: number;
  skipped: number;
  errors: string[];
};

function parseDate(val: string): string | null {
  if (!val) return null;
  // Accept: DD.MM.YYYY, YYYY-MM-DD, DD/MM/YYYY
  const clean = val.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  const ddmm = clean.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (ddmm) {
    const [, d, m, y] = ddmm;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

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
  if (v === "one_time" || v.includes("einmal")) return "one_time";
  if (v === "installments" || v.includes("rate") || v.includes("raten")) return "installments";
  return null;
}

export async function importDeals(rows: ImportRow[]): Promise<ImportResult> {
  const session = await getCurrentSession();
  if (!session) throw new Error("Nicht angemeldet.");
  if (session.role !== "admin") throw new Error("Nur Admins können Deals importieren.");

  const supabase = await createClient();

  // Fetch all lookup data for this org
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

    const close_date = parseDate(row.close_date);
    if (!close_date) {
      errors.push(`${rowLabel} (${row.customer_name}): Ungültiges Abschlussdatum.`);
      skipped++;
      continue;
    }

    const total_price = parsePrice(row.total_price ?? "");
    if (total_price === null || total_price < 0) {
      errors.push(`${rowLabel} (${row.customer_name}): Ungültiger Preis.`);
      skipped++;
      continue;
    }

    const payment_type = parsePaymentType(row.payment_type ?? "");
    if (!payment_type) {
      errors.push(`${rowLabel} (${row.customer_name}): Zahlungsart muss "Einmalzahlung" oder "Ratenzahlung" sein.`);
      skipped++;
      continue;
    }

    const { data: deal, error: dealErr } = await supabase
      .from("deals")
      .insert({
        organization_id: session.organizationId,
        created_by: session.userId,
        customer_name: row.customer_name.trim(),
        order_id: row.order_id?.trim() || null,
        platform_id: findId(platforms, row.platform_name),
        product_id: findId(products, row.product_name),
        payment_method: row.payment_method?.trim() || null,
        closer_id: findId(closers, row.closer_name),
        sales_partner_id: findId(partners, row.sales_partner_name),
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

    // Create payment records
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

    imported++;
  }

  revalidatePath("/deals");
  return { imported, skipped, errors };
}

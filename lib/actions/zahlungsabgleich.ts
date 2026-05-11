"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/get-current-org";

export type AbgleichRow = {
  order_id: string;
  platform: "copecart" | "digistore" | "ablefy";
  status: "paid" | "refunded" | "failed";
  installment_sequence?: number; // 1-based; for Digistore + Ablefy
};

export type AbgleichResult = {
  updated: number;
  skipped: number;
  created: number;
  notFound: string[];
  errors: string[];
};

export async function processZahlungsabgleich(rows: AbgleichRow[]): Promise<AbgleichResult> {
  const session = await requireRole("admin");

  const supabase = await createClient();

  const paidRows = rows.filter((r) => r.status === "paid");
  if (paidRows.length === 0) return { updated: 0, skipped: rows.length, created: 0, notFound: [], errors: [] };

  const orderIds = [...new Set(paidRows.map((r) => r.order_id))];

  // Fetch matching deals
  const { data: deals } = await supabase
    .from("deals")
    .select("id, order_id, payment_type")
    .eq("organization_id", session.organizationId)
    .in("order_id", orderIds);

  const dealMap = new Map<string, { id: string; payment_type: string }>();
  for (const d of deals ?? []) {
    if (d.order_id) dealMap.set(d.order_id, { id: d.id, payment_type: d.payment_type });
  }

  // Fetch platform IDs for auto-created deals
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
      // Deal not found — create a placeholder so the payment can be tracked
      const hasSequence = !!row.installment_sequence;
      const platformName =
        row.platform === "copecart" ? "copecart"
        : row.platform === "digistore" ? "digistore"
        : "ablefy";
      const platformId =
        platformIdMap.get(platformName) ??
        platformIdMap.get(row.platform) ??
        null;

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

      // Create the corresponding payment record
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

      if (error) {
        errors.push(`${row.order_id}: ${error.message}`);
      } else {
        updated++;
      }
    } else {
      // installments
      if (row.installment_sequence) {
        const { error } = await supabase
          .from("installments")
          .update({ paid: true, paid_at: new Date().toISOString() })
          .eq("deal_id", deal.id)
          .eq("organization_id", session.organizationId)
          .eq("sequence", row.installment_sequence)
          .eq("paid", false);

        if (error) {
          errors.push(`${row.order_id} Rate ${row.installment_sequence}: ${error.message}`);
        } else {
          updated++;
        }
      } else {
        // No sequence info: mark all unpaid installments as paid
        const { error } = await supabase
          .from("installments")
          .update({ paid: true, paid_at: new Date().toISOString() })
          .eq("deal_id", deal.id)
          .eq("organization_id", session.organizationId)
          .eq("paid", false);

        if (error) {
          errors.push(`${row.order_id}: ${error.message}`);
        } else {
          updated++;
        }
      }
    }
  }

  skipped = rows.length - paidRows.length;

  revalidatePath("/deals");
  revalidatePath("/import/zahlungsabgleich");

  return { updated, skipped, created, notFound, errors };
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/get-current-org";

export type AbgleichRow = {
  order_id: string;
  platform: "copecart" | "digistore" | "ablefy";
  status: "paid" | "refunded" | "failed";
  installment_sequence?: number; // 1-based; for Digistore + Ablefy
};

export type AbgleichResult = {
  updated: number;
  skipped: number;
  notFound: string[];
  errors: string[];
};

export async function processZahlungsabgleich(rows: AbgleichRow[]): Promise<AbgleichResult> {
  const session = await getCurrentSession();
  if (!session) return { updated: 0, skipped: 0, notFound: [], errors: ["Nicht angemeldet."] };

  const supabase = await createClient();

  const paidRows = rows.filter((r) => r.status === "paid");
  if (paidRows.length === 0) return { updated: 0, skipped: rows.length, notFound: [], errors: [] };

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

  const notFound: string[] = [];
  const errors: string[] = [];
  let updated = 0;
  let skipped = 0;

  for (const row of paidRows) {
    const deal = dealMap.get(row.order_id);
    if (!deal) {
      if (!notFound.includes(row.order_id)) notFound.push(row.order_id);
      continue;
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
  revalidatePath("/zahlungsabgleich");

  return { updated, skipped, notFound, errors };
}

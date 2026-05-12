"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/get-current-org";

// ---------------------------------------------------------------------------
// Schema (identisch mit deals.ts)
// ---------------------------------------------------------------------------

const uuidOpt = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z.string().uuid().nullable(),
);

const optDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum.")
  .optional()
  .nullable()
  .transform((v) => v || null);

const DealSchema = z.object({
  customer_name: z.string().min(1, "Pflichtfeld.").trim(),
  platform_id: uuidOpt,
  payment_method: z.string().trim().optional().transform((v) => v || null),
  product_id: uuidOpt,
  order_id: z.string().trim().optional().transform((v) => v || null),
  sales_partner_id: uuidOpt,
  closer_id: uuidOpt,
  total_price: z.coerce.number().min(0, "Muss ≥ 0 sein."),
  payment_type: z.enum(["one_time", "installments"]),
  close_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum."),
  inkasso_required: z.string().optional().transform((v) => v === "on"),
  mahnung_required: z.string().optional().transform((v) => v === "on"),
  onboarding_done: z.string().optional().transform((v) => v === "on"),
  update_call_done: z.string().optional().transform((v) => v === "on"),
  notes: z.string().trim().optional().transform((v) => v || null),
  number_of_rates: z.coerce.number().int().min(1).optional().nullable(),
  first_due_date: optDate,
  down_payment: z.preprocess(
    (v) => (v === "" || v == null ? null : Number(v)),
    z.number().nonnegative("Muss ≥ 0 sein.").nullable(),
  ),
  one_time_due_date: optDate,
  new_sales_partner_name: z.string().trim().optional().transform((v) => v || null),
});

function generateInstallments(
  dealId: string,
  orgId: string,
  totalPrice: number,
  numberOfRates: number,
  firstDueDate: string,
) {
  const baseAmount = Math.floor((totalPrice / numberOfRates) * 100) / 100;
  const lastAmount = Math.round((totalPrice - baseAmount * (numberOfRates - 1)) * 100) / 100;
  const rows = [];
  const base = new Date(firstDueDate);
  for (let i = 1; i <= numberOfRates; i++) {
    const d = new Date(base);
    d.setMonth(d.getMonth() + (i - 1));
    rows.push({
      deal_id: dealId,
      organization_id: orgId,
      sequence: i,
      due_date: d.toISOString().slice(0, 10),
      amount: i === numberOfRates ? lastAmount : baseAmount,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export type CreateFromImportResult =
  | { dealId: string }
  | { error: string; fieldErrors?: Partial<Record<string, string[]>> };

// ---------------------------------------------------------------------------
// Action — kein redirect(), gibt dealId zurück
// ---------------------------------------------------------------------------

export async function createDealFromImport(
  _prev: CreateFromImportResult | null,
  formData: FormData,
): Promise<CreateFromImportResult> {
  const session = await getCurrentSession();
  if (!session) return { error: "Nicht angemeldet." };

  const result = DealSchema.safeParse(Object.fromEntries(formData));
  if (!result.success) {
    return { fieldErrors: result.error.flatten().fieldErrors, error: "Bitte alle Pflichtfelder ausfüllen." };
  }

  const {
    number_of_rates,
    first_due_date,
    one_time_due_date,
    new_sales_partner_name,
    down_payment,
    ...dealFields
  } = result.data;

  if (dealFields.payment_type === "installments" && (!number_of_rates || !first_due_date)) {
    return { error: "Bitte Anzahl Raten und erstes Fälligkeitsdatum angeben." };
  }

  const supabase = await createClient();

  let salesPartnerId = dealFields.sales_partner_id;
  if (new_sales_partner_name) {
    const { data: newPartner } = await supabase
      .from("sales_partners")
      .insert({ organization_id: session.organizationId, name: new_sales_partner_name, commission_rate: 0 })
      .select("id")
      .single();
    if (newPartner) salesPartnerId = newPartner.id;
  }

  const { data: deal, error } = await supabase
    .from("deals")
    .insert({
      ...dealFields,
      sales_partner_id: salesPartnerId,
      down_payment,
      organization_id: session.organizationId,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error || !deal) {
    return { error: "Deal konnte nicht gespeichert werden." };
  }

  if (dealFields.payment_type === "one_time") {
    await supabase.from("one_time_payments").insert({
      deal_id: deal.id,
      organization_id: session.organizationId,
      due_date: one_time_due_date ?? null,
    });
  } else if (number_of_rates && first_due_date) {
    const installmentTotal = dealFields.total_price - (down_payment ?? 0);
    const rows = generateInstallments(deal.id, session.organizationId, installmentTotal, number_of_rates, first_due_date);
    await supabase.from("installments").insert(rows);
  }

  revalidatePath("/deals");
  return { dealId: deal.id };
}

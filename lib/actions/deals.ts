"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/get-current-org";

export type DealFormState = {
  error?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
} | null;

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const uuidOpt = z
  .string()
  .uuid()
  .optional()
  .nullable()
  .transform((v) => v || null);

const DealSchema = z.object({
  customer_name: z.string().min(1, "Pflichtfeld.").trim(),
  platform_id: uuidOpt,
  payment_method: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null),
  product_id: uuidOpt,
  order_id: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null),
  sales_partner_id: uuidOpt,
  closer_id: uuidOpt,
  total_price: z.coerce
    .number()
    .min(0, "Muss ≥ 0 sein."),
  payment_type: z.enum(["one_time", "installments"]),
  close_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum."),
  inkasso_required: z
    .string()
    .optional()
    .transform((v) => v === "on"),
  onboarding_done: z
    .string()
    .optional()
    .transform((v) => v === "on"),
  update_call_done: z
    .string()
    .optional()
    .transform((v) => v === "on"),
  notes: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null),
  number_of_rates: z.coerce
    .number()
    .int()
    .min(2, "Mindestens 2 Raten.")
    .optional()
    .nullable(),
  first_due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum.")
    .optional()
    .nullable()
    .transform((v) => v || null),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateInstallments(
  dealId: string,
  orgId: string,
  totalPrice: number,
  numberOfRates: number,
  firstDueDate: string,
): Array<{
  deal_id: string;
  organization_id: string;
  sequence: number;
  due_date: string;
  amount: number;
}> {
  const baseAmount = Math.floor((totalPrice / numberOfRates) * 100) / 100;
  const lastAmount =
    Math.round((totalPrice - baseAmount * (numberOfRates - 1)) * 100) / 100;

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
// createDeal
// ---------------------------------------------------------------------------

export async function createDeal(
  _prev: DealFormState,
  formData: FormData,
): Promise<DealFormState> {
  const session = await getCurrentSession();
  if (!session) return { error: "Nicht angemeldet." };

  const result = DealSchema.safeParse(Object.fromEntries(formData));
  if (!result.success) {
    return { fieldErrors: result.error.flatten().fieldErrors };
  }

  const {
    number_of_rates,
    first_due_date,
    ...dealFields
  } = result.data;

  if (
    dealFields.payment_type === "installments" &&
    (!number_of_rates || !first_due_date)
  ) {
    return { error: "Bitte Anzahl Raten und erstes Fälligkeitsdatum angeben." };
  }

  const supabase = await createClient();

  const { data: deal, error } = await supabase
    .from("deals")
    .insert({
      ...dealFields,
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
    });
  } else if (number_of_rates && first_due_date) {
    const rows = generateInstallments(
      deal.id,
      session.organizationId,
      dealFields.total_price,
      number_of_rates,
      first_due_date,
    );
    await supabase.from("installments").insert(rows);
  }

  revalidatePath("/deals");
  redirect("/deals");
}

// ---------------------------------------------------------------------------
// updateDeal
// ---------------------------------------------------------------------------

export async function updateDeal(
  id: string,
  _prev: DealFormState,
  formData: FormData,
): Promise<DealFormState> {
  const session = await getCurrentSession();
  if (!session) return { error: "Nicht angemeldet." };

  const result = DealSchema.safeParse(Object.fromEntries(formData));
  if (!result.success) {
    return { fieldErrors: result.error.flatten().fieldErrors };
  }

  const { number_of_rates: _nr, first_due_date: _fd, ...dealFields } = result.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("deals")
    .update(dealFields)
    .eq("id", id)
    .eq("organization_id", session.organizationId);

  if (error) return { error: "Änderungen konnten nicht gespeichert werden." };

  revalidatePath("/deals");
  revalidatePath(`/deals/${id}`);
  redirect(`/deals/${id}`);
}

// ---------------------------------------------------------------------------
// deleteDeal
// ---------------------------------------------------------------------------

export async function deleteDeal(id: string): Promise<void> {
  const session = await getCurrentSession();
  if (!session) return;

  const supabase = await createClient();
  await supabase
    .from("deals")
    .delete()
    .eq("id", id)
    .eq("organization_id", session.organizationId);

  revalidatePath("/deals");
  redirect("/deals");
}

// ---------------------------------------------------------------------------
// markInstallmentPaid / unmarkInstallmentPaid
// ---------------------------------------------------------------------------

export async function markInstallmentPaid(
  installmentId: string,
  dealId: string,
  paid: boolean,
): Promise<{ error?: string }> {
  const session = await getCurrentSession();
  if (!session) return { error: "Nicht angemeldet." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("installments")
    .update({
      paid,
      paid_at: paid ? new Date().toISOString() : null,
    })
    .eq("id", installmentId)
    .eq("organization_id", session.organizationId);

  if (error) return { error: "Status konnte nicht aktualisiert werden." };

  revalidatePath(`/deals/${dealId}`);
  return {};
}

// ---------------------------------------------------------------------------
// markOneTimePaid / unmarkOneTimePaid
// ---------------------------------------------------------------------------

export async function markOneTimePaid(
  dealId: string,
  paid: boolean,
): Promise<{ error?: string }> {
  const session = await getCurrentSession();
  if (!session) return { error: "Nicht angemeldet." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("one_time_payments")
    .update({
      paid,
      paid_at: paid ? new Date().toISOString() : null,
    })
    .eq("deal_id", dealId)
    .eq("organization_id", session.organizationId);

  if (error) return { error: "Status konnte nicht aktualisiert werden." };

  revalidatePath(`/deals/${dealId}`);
  return {};
}

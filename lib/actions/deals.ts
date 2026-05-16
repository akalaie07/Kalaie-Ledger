"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getCurrentSession, requireRole } from "@/lib/auth/get-current-org";

export type DealFormState = {
  error?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
} | null;

// ---------------------------------------------------------------------------
// Schema
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
  closer_id: uuidOpt,
  total_price: z.coerce
    .number()
    .min(0, "Muss ≥ 0 sein."),
  payment_type: z.enum(["one_time", "installments", "subscription_monthly", "subscription_yearly"]),
  close_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum."),
  inkasso_required: z
    .string()
    .optional()
    .transform((v) => v === "on"),
  mahnung_required: z
    .string()
    .optional()
    .transform((v) => v === "on"),
  chargeback: z
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
    .min(1, "Mindestens 1 Rate/Periode.")
    .optional()
    .nullable(),
  first_due_date: optDate,
  // Neu: Anzahlung
  down_payment: z.preprocess(
    (v) => (v === "" || v == null ? null : Number(v)),
    z.number().nonnegative("Muss ≥ 0 sein.").nullable(),
  ),
  // Neu: Fälligkeitsdatum für Einmalzahlung
  one_time_due_date: optDate,
  // Abo-Felder
  recurring_amount: z.preprocess(
    (v) => (v === "" || v == null ? null : Number(v)),
    z.number().nonnegative().nullable(),
  ),
  subscription_start_date: optDate,
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
    one_time_due_date,
    down_payment,
    recurring_amount,
    subscription_start_date,
    ...dealFields
  } = result.data;

  const isSubscription =
    dealFields.payment_type === "subscription_monthly" ||
    dealFields.payment_type === "subscription_yearly";

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
      down_payment,
      recurring_amount: isSubscription ? recurring_amount : null,
      subscription_start_date: isSubscription ? subscription_start_date : null,
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
  } else if (isSubscription) {
    // Anmeldegebühr als one_time_payment tracken (falls vorhanden)
    if ((dealFields.total_price ?? 0) > 0) {
      await supabase.from("one_time_payments").insert({
        deal_id: deal.id,
        organization_id: session.organizationId,
        due_date: subscription_start_date ?? null,
      });
    }
    // Ersten Abo-Monat / -Jahr als subscription_payment anlegen (falls Start gesetzt)
    if (subscription_start_date && recurring_amount && recurring_amount > 0) {
      await supabase.from("subscription_payments").insert({
        deal_id: deal.id,
        organization_id: session.organizationId,
        sequence: 1,
        due_date: subscription_start_date,
        amount: recurring_amount,
      });
    }
  } else if (number_of_rates && first_due_date) {
    // Raten decken den Betrag nach Anzahlung ab
    const installmentTotal = dealFields.total_price - (down_payment ?? 0);
    const rows = generateInstallments(
      deal.id,
      session.organizationId,
      installmentTotal,
      number_of_rates,
      first_due_date,
    );
    await supabase.from("installments").insert(rows);

    // Anzahlung als one_time_payment tracken (damit sie auf der Detail-Seite abgehakt werden kann)
    if ((down_payment ?? 0) > 0) {
      await supabase.from("one_time_payments").insert({
        deal_id: deal.id,
        organization_id: session.organizationId,
        due_date: one_time_due_date ?? null, // Anzahlungsdatum aus dem Formular
      });
    }
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

  const {
    number_of_rates,
    first_due_date,
    one_time_due_date,
    down_payment,
    recurring_amount,
    subscription_start_date,
    ...dealFields
  } = result.data;

  const isSubscription =
    dealFields.payment_type === "subscription_monthly" ||
    dealFields.payment_type === "subscription_yearly";

  const supabase = await createClient();

  const { error } = await supabase
    .from("deals")
    .update({
      ...dealFields,
      down_payment,
      recurring_amount: isSubscription ? recurring_amount : null,
      subscription_start_date: isSubscription ? subscription_start_date : null,
    })
    .eq("id", id)
    .eq("organization_id", session.organizationId);

  if (error) return { error: "Änderungen konnten nicht gespeichert werden." };

  // Fälligkeitsdatum der Einmalzahlung aktualisieren
  if (dealFields.payment_type === "one_time") {
    await supabase
      .from("one_time_payments")
      .update({ due_date: one_time_due_date ?? null })
      .eq("deal_id", id)
      .eq("organization_id", session.organizationId);
  }

  // Raten neu generieren wenn angegeben
  if (dealFields.payment_type === "installments" && number_of_rates && first_due_date) {
    // Bestehende Raten löschen
    await supabase
      .from("installments")
      .delete()
      .eq("deal_id", id)
      .eq("organization_id", session.organizationId);

    const installmentTotal = dealFields.total_price - (down_payment ?? 0);
    const rows = generateInstallments(
      id,
      session.organizationId,
      installmentTotal,
      number_of_rates,
      first_due_date,
    );
    await supabase.from("installments").insert(rows);

    // Anzahlung-Tracking: one_time_payment upserten wenn Anzahlung vorhanden
    if ((down_payment ?? 0) > 0) {
      const { data: existing } = await supabase
        .from("one_time_payments")
        .select("id")
        .eq("deal_id", id)
        .eq("organization_id", session.organizationId)
        .maybeSingle();

      if (!existing) {
        await supabase.from("one_time_payments").insert({
          deal_id: id,
          organization_id: session.organizationId,
          due_date: first_due_date,
        });
      }
    }
  }

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
// bulkDeleteDeals
// ---------------------------------------------------------------------------

export async function bulkDeleteDeals(ids: string[]): Promise<{ error?: string }> {
  if (ids.length === 0) return {};
  const session = await requireRole("admin");
  const supabase = await createClient();
  const { error } = await supabase
    .from("deals")
    .delete()
    .in("id", ids)
    .eq("organization_id", session.organizationId);
  if (error) return { error: error.message };
  revalidatePath("/deals");
  return {};
}

// ---------------------------------------------------------------------------
// toggleDealFlag — Onboarding / Update-Call direkt aus der Tabelle toggeln
// ---------------------------------------------------------------------------

export async function toggleDealFlag(
  dealId: string,
  flag: "onboarding_done" | "update_call_done",
  value: boolean,
): Promise<{ error?: string }> {
  const session = await getCurrentSession();
  if (!session) return { error: "Nicht angemeldet." };

  const supabase = await createClient();
  const patch =
    flag === "onboarding_done"
      ? { onboarding_done: value }
      : { update_call_done: value };
  const { error } = await supabase
    .from("deals")
    .update(patch)
    .eq("id", dealId)
    .eq("organization_id", session.organizationId);

  revalidatePath("/deals");
  if (error) return { error: error.message };
  return {};
}

// ---------------------------------------------------------------------------
// setDealEscalation
// ---------------------------------------------------------------------------

export async function setDealEscalation(
  dealId: string,
  mahnung: boolean,
  inkasso: boolean,
): Promise<{ error?: string }> {
  const session = await getCurrentSession();
  if (!session) return { error: "Nicht angemeldet." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("deals")
    .update({ mahnung_required: mahnung, inkasso_required: inkasso })
    .eq("id", dealId)
    .eq("organization_id", session.organizationId);

  revalidatePath("/deals");
  revalidatePath("/forderungsmanagement/mahnung");
  revalidatePath("/forderungsmanagement/inkasso");
  if (error) return { error: error.message };
  return {};
}

// ---------------------------------------------------------------------------
// updateDealNote
// ---------------------------------------------------------------------------

export async function updateDealNote(
  dealId: string,
  notes: string,
): Promise<{ error?: string }> {
  const session = await getCurrentSession();
  if (!session) return { error: "Nicht angemeldet." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("deals")
    .update({ notes: notes.trim() || null })
    .eq("id", dealId)
    .eq("organization_id", session.organizationId);

  revalidatePath("/forderungsmanagement/mahnung");
  if (error) return { error: error.message };
  return {};
}

// ---------------------------------------------------------------------------
// generateInstallmentsForDeal — Raten für bestehenden Deal nachtragen
// (z.B. für importierte Deals ohne Raten)
// ---------------------------------------------------------------------------

export async function generateInstallmentsForDeal(
  dealId: string,
  numberOfRates: number,
  firstDueDate: string,
): Promise<{ error?: string }> {
  const session = await getCurrentSession();
  if (!session) return { error: "Nicht angemeldet." };

  if (numberOfRates < 1 || numberOfRates > 360)
    return { error: "Anzahl Raten muss zwischen 1 und 360 liegen." };

  const supabase = await createClient();

  // Deal laden um total_price und down_payment zu ermitteln
  const { data: deal } = await supabase
    .from("deals")
    .select("total_price, down_payment")
    .eq("id", dealId)
    .eq("organization_id", session.organizationId)
    .single();

  if (!deal) return { error: "Deal nicht gefunden." };

  // Bestehende Raten löschen (Neuberechnung)
  await supabase
    .from("installments")
    .delete()
    .eq("deal_id", dealId)
    .eq("organization_id", session.organizationId);

  const installmentTotal = deal.total_price - (deal.down_payment ?? 0);
  const rows = generateInstallments(
    dealId,
    session.organizationId,
    installmentTotal,
    numberOfRates,
    firstDueDate,
  );

  const { error } = await supabase.from("installments").insert(rows);
  if (error) return { error: "Raten konnten nicht gespeichert werden." };

  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals");
  return {};
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

// ---------------------------------------------------------------------------
// addSubscriptionPayment — neuen Abo-Monat / -Jahr hinzufügen
// ---------------------------------------------------------------------------

export async function addSubscriptionPayment(
  dealId: string,
  dueDate: string,
  amount: number,
): Promise<{ error?: string }> {
  const session = await getCurrentSession();
  if (!session) return { error: "Nicht angemeldet." };

  const supabase = await createClient();

  const { count } = await supabase
    .from("subscription_payments")
    .select("*", { count: "exact", head: true })
    .eq("deal_id", dealId)
    .eq("organization_id", session.organizationId);

  const { error } = await supabase.from("subscription_payments").insert({
    deal_id: dealId,
    organization_id: session.organizationId,
    sequence: (count ?? 0) + 1,
    due_date: dueDate,
    amount,
  });

  if (error) return { error: "Zahlung konnte nicht hinzugefügt werden." };
  revalidatePath(`/deals/${dealId}`);
  return {};
}

// ---------------------------------------------------------------------------
// toggleSubscriptionPayment — Abo-Zahlung als bezahlt/offen markieren
// ---------------------------------------------------------------------------

export async function toggleSubscriptionPayment(
  paymentId: string,
  dealId: string,
  paid: boolean,
): Promise<{ error?: string }> {
  const session = await getCurrentSession();
  if (!session) return { error: "Nicht angemeldet." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("subscription_payments")
    .update({
      paid,
      paid_at: paid ? new Date().toISOString() : null,
    })
    .eq("id", paymentId)
    .eq("organization_id", session.organizationId);

  if (error) return { error: "Status konnte nicht aktualisiert werden." };
  revalidatePath(`/deals/${dealId}`);
  return {};
}

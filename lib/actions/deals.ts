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
  sales_partner_id: uuidOpt,
  closer_manual: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null),
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
  storniert: z
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
  reg_fee_paid: z
    .string()
    .optional()
    .transform((v) => v === "on"),
  // Upsell — nur Markierung + Referenz-Bestell-ID am selben Deal
  is_upsell: z
    .string()
    .optional()
    .transform((v) => v === "on"),
  upsell_order_id: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null),
  upsell_product_id: uuidOpt,
  upsell_amount: z.preprocess(
    (v) => (v === "" || v == null ? null : Number(v)),
    z.number().nonnegative("Muss ≥ 0 sein.").nullable(),
  ),
  upsell_paid: z
    .string()
    .optional()
    .transform((v) => v === "on"),
  // Begleitung läuft bis am
  coaching_until: optDate,
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
    reg_fee_paid,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  if (dealFields.payment_type === "installments") {
    const installmentTotal = dealFields.total_price - (down_payment ?? 0);
    if (installmentTotal < 0) {
      return { error: "Anzahlung darf den Gesamtpreis nicht übersteigen." };
    }
  }

  const supabase = await createClient();

  const { data: deal, error } = await supabase
    .from("deals")
    .insert({
      ...dealFields,
      down_payment,
      recurring_amount: isSubscription ? recurring_amount : null,
      subscription_start_date: isSubscription ? subscription_start_date : null,
      upsell_order_id: dealFields.is_upsell ? dealFields.upsell_order_id : null,
      upsell_product_id: dealFields.is_upsell ? dealFields.upsell_product_id : null,
      upsell_amount: dealFields.is_upsell ? dealFields.upsell_amount : null,
      upsell_paid: dealFields.is_upsell ? dealFields.upsell_paid : false,
      coaching_until: isSubscription ? null : dealFields.coaching_until,
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
        paid: reg_fee_paid ?? false,
        paid_at: reg_fee_paid ? new Date().toISOString() : null,
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
    reg_fee_paid,
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
      upsell_order_id: dealFields.is_upsell ? dealFields.upsell_order_id : null,
      upsell_product_id: dealFields.is_upsell ? dealFields.upsell_product_id : null,
      upsell_amount: dealFields.is_upsell ? dealFields.upsell_amount : null,
      upsell_paid: dealFields.is_upsell ? dealFields.upsell_paid : false,
      coaching_until: isSubscription ? null : dealFields.coaching_until,
    })
    .eq("id", id)
    .eq("organization_id", session.organizationId);

  if (error) return { error: "Änderungen konnten nicht gespeichert werden." };

  // ── Zahlungs-Records mit dem (ggf. gewechselten) Zahlungsmodell abgleichen ──
  // Beim Modell-Wechsel werden verwaiste UNbezahlte Records der anderen Modelle
  // entfernt und fehlende Records des neuen Modells angelegt. Bezahlte Records
  // bleiben als Historie stehen — der Saldo (deal_balance) zählt ohnehin nur
  // die zum payment_type passenden Einträge.

  if (dealFields.payment_type === "one_time") {
    await supabase
      .from("installments")
      .delete()
      .eq("deal_id", id)
      .eq("organization_id", session.organizationId)
      .eq("paid", false);
    await supabase
      .from("subscription_payments")
      .delete()
      .eq("deal_id", id)
      .eq("organization_id", session.organizationId)
      .eq("paid", false);

    // Zahlungs-Record sicherstellen — ohne ihn fehlt der "Zahlung"-Block und
    // der Deal kann nie als bezahlt markiert werden (passierte beim Wechsel
    // von Raten/Abo auf Einmalzahlung). one_time_payments ist 1:1 über deal_id.
    const { data: existingOtp } = await supabase
      .from("one_time_payments")
      .select("deal_id")
      .eq("deal_id", id)
      .eq("organization_id", session.organizationId)
      .limit(1)
      .maybeSingle();

    if (existingOtp) {
      await supabase
        .from("one_time_payments")
        .update({ due_date: one_time_due_date ?? null })
        .eq("deal_id", id)
        .eq("organization_id", session.organizationId);
    } else {
      await supabase.from("one_time_payments").insert({
        deal_id: id,
        organization_id: session.organizationId,
        due_date: one_time_due_date ?? null,
      });
    }
  }

  if (isSubscription) {
    await supabase
      .from("installments")
      .delete()
      .eq("deal_id", id)
      .eq("organization_id", session.organizationId)
      .eq("paid", false);

    // Anmeldegebühr-Status aktualisieren bzw. anlegen
    const { data: existingOtp } = await supabase
      .from("one_time_payments")
      .select("deal_id")
      .eq("deal_id", id)
      .eq("organization_id", session.organizationId)
      .limit(1)
      .maybeSingle();

    if (existingOtp) {
      await supabase
        .from("one_time_payments")
        .update({
          paid: reg_fee_paid ?? false,
          paid_at: reg_fee_paid ? new Date().toISOString() : null,
        })
        .eq("deal_id", id)
        .eq("organization_id", session.organizationId);
    } else if ((dealFields.total_price ?? 0) > 0) {
      await supabase.from("one_time_payments").insert({
        deal_id: id,
        organization_id: session.organizationId,
        due_date: subscription_start_date ?? null,
        paid: reg_fee_paid ?? false,
        paid_at: reg_fee_paid ? new Date().toISOString() : null,
      });
    }

    // Ersten Abo-Zeitraum anlegen falls noch keiner existiert — wie beim
    // Anlegen (sonst bleibt die Abo-Tabelle nach einem Typ-Wechsel leer).
    const { count: subCount } = await supabase
      .from("subscription_payments")
      .select("id", { count: "exact", head: true })
      .eq("deal_id", id)
      .eq("organization_id", session.organizationId);

    if (
      (subCount ?? 0) === 0 &&
      subscription_start_date &&
      recurring_amount &&
      recurring_amount > 0
    ) {
      await supabase.from("subscription_payments").insert({
        deal_id: id,
        organization_id: session.organizationId,
        sequence: 1,
        due_date: subscription_start_date,
        amount: recurring_amount,
      });
    }
  }

  // Raten neu generieren wenn angegeben
  if (dealFields.payment_type === "installments" && number_of_rates && first_due_date) {
    const installmentTotal = dealFields.total_price - (down_payment ?? 0);
    if (installmentTotal < 0) {
      return { error: "Anzahlung darf den Gesamtpreis nicht übersteigen." };
    }

    await supabase
      .from("subscription_payments")
      .delete()
      .eq("deal_id", id)
      .eq("organization_id", session.organizationId)
      .eq("paid", false);

    // Bestehende Raten löschen
    const { error: deleteError } = await supabase
      .from("installments")
      .delete()
      .eq("deal_id", id)
      .eq("organization_id", session.organizationId);

    if (deleteError) return { error: "Raten konnten nicht aktualisiert werden." };
    const rows = generateInstallments(
      id,
      session.organizationId,
      installmentTotal,
      number_of_rates,
      first_due_date,
    );
    await supabase.from("installments").insert(rows);

    // Anzahlung-Tracking: one_time_payment upserten wenn Anzahlung vorhanden,
    // sonst verwaiste unbezahlte Records entfernen (würden als "Anzahlung"-Block
    // ohne Anzahlung angezeigt).
    const { data: existing } = await supabase
      .from("one_time_payments")
      .select("deal_id")
      .eq("deal_id", id)
      .eq("organization_id", session.organizationId)
      .limit(1)
      .maybeSingle();

    if ((down_payment ?? 0) > 0) {
      if (!existing) {
        await supabase.from("one_time_payments").insert({
          deal_id: id,
          organization_id: session.organizationId,
          due_date: one_time_due_date ?? first_due_date,
        });
      }
    } else if (existing) {
      await supabase
        .from("one_time_payments")
        .delete()
        .eq("deal_id", id)
        .eq("organization_id", session.organizationId)
        .eq("paid", false);
    }
  }

  revalidatePath("/deals");
  revalidatePath(`/deals/${id}`);
  redirect(`/deals/${id}`);
}

// ---------------------------------------------------------------------------
// deleteDeal
// ---------------------------------------------------------------------------

export async function deleteDeal(id: string): Promise<{ error?: string }> {
  const session = await getCurrentSession();
  if (!session) return { error: "Nicht angemeldet." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("deals")
    .delete()
    .eq("id", id)
    .eq("organization_id", session.organizationId);

  if (error) return { error: error.message };
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
  flag: "onboarding_done" | "update_call_done" | "chargeback" | "storniert",
  value: boolean,
): Promise<{ error?: string }> {
  const session = await getCurrentSession();
  if (!session) return { error: "Nicht angemeldet." };

  const supabase = await createClient();
  const patch =
    flag === "onboarding_done" ? { onboarding_done: value }
    : flag === "update_call_done" ? { update_call_done: value }
    : flag === "chargeback" ? { chargeback: value }
    : { storniert: value };
  const { error } = await supabase
    .from("deals")
    .update(patch)
    .eq("id", dealId)
    .eq("organization_id", session.organizationId);

  if (error) return { error: error.message };
  revalidatePath("/deals");
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

  if (error) return { error: error.message };
  revalidatePath("/deals");
  revalidatePath("/forderungsmanagement/mahnung");
  revalidatePath("/forderungsmanagement/inkasso");
  return {};
}

// ---------------------------------------------------------------------------
// markCoachingDone — Begleitung als bearbeitet markieren (raus aus dem Ordner)
// ---------------------------------------------------------------------------

export async function markCoachingDone(
  dealId: string,
): Promise<{ error?: string }> {
  const session = await getCurrentSession();
  if (!session) return { error: "Nicht angemeldet." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("deals")
    .update({ coaching_done: true })
    .eq("id", dealId)
    .eq("organization_id", session.organizationId);

  if (error) return { error: "Konnte nicht als erledigt markiert werden." };

  revalidatePath("/deals/begleitung");
  revalidatePath(`/deals/${dealId}`);
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

  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals");
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

  const installmentTotal = deal.total_price - (deal.down_payment ?? 0);
  if (installmentTotal < 0) {
    return { error: "Anzahlung übersteigt den Gesamtpreis. Bitte zuerst den Deal korrigieren." };
  }

  // Bestehende Raten löschen (Neuberechnung)
  await supabase
    .from("installments")
    .delete()
    .eq("deal_id", dealId)
    .eq("organization_id", session.organizationId);
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

// ---------------------------------------------------------------------------
// deleteSubscriptionPayment — unbezahlte Abo-Zahlung löschen (z.B. nach Storno)
// ---------------------------------------------------------------------------

export async function deleteSubscriptionPayment(
  paymentId: string,
  dealId: string,
): Promise<{ error?: string }> {
  const session = await getCurrentSession();
  if (!session) return { error: "Nicht angemeldet." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("subscription_payments")
    .delete()
    .eq("id", paymentId)
    .eq("deal_id", dealId)
    .eq("organization_id", session.organizationId)
    .eq("paid", false);

  if (error) return { error: "Zahlung konnte nicht gelöscht werden." };
  revalidatePath(`/deals/${dealId}`);
  return {};
}

// ---------------------------------------------------------------------------
// updateSubscriptionPayment — Datum / Betrag einer Abo-Zahlung bearbeiten
// ---------------------------------------------------------------------------

export async function updateSubscriptionPayment(
  paymentId: string,
  dealId: string,
  dueDate: string,
  amount: number,
): Promise<{ error?: string }> {
  const session = await getCurrentSession();
  if (!session) return { error: "Nicht angemeldet." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("subscription_payments")
    .update({ due_date: dueDate, amount })
    .eq("id", paymentId)
    .eq("organization_id", session.organizationId);

  if (error) return { error: "Zahlung konnte nicht aktualisiert werden." };
  revalidatePath(`/deals/${dealId}`);
  return {};
}

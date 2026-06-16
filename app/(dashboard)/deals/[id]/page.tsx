import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, FileDown, Pencil } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

import { requireSession } from "@/lib/auth/get-current-org";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { OneTimeToggle } from "./_components/payment-toggle";
import { AddInstallmentsForm } from "./_components/add-installments-form";
import { SubscriptionTracker } from "./_components/subscription-tracker";
import { InstallmentsTracker } from "./_components/installments-tracker";

export const metadata: Metadata = { title: "Deal — Buchhaltung" };

const PAYMENT_LABEL: Record<string, string> = {
  one_time: "Einmalzahlung",
  installments: "Ratenzahlung",
  subscription_monthly: "Abo — Monatlich",
  subscription_yearly: "Abo — Jährlich",
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2.5 border-b border-border/60 last:border-0">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm text-right">{value ?? "—"}</span>
    </div>
  );
}

function StatusBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        active
          ? "bg-emerald-500/15 text-emerald-400"
          : "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const supabase = await createClient();

  const { data: deal } = await supabase
    .from("deals")
    .select(
      "*, platforms(name), products(name), closers(name), sales_partners(name)",
    )
    .eq("id", id)
    .eq("organization_id", session.organizationId)
    .single();

  if (!deal) notFound();

  const isSubscription =
    deal.payment_type === "subscription_monthly" ||
    deal.payment_type === "subscription_yearly";

  const [{ data: installments }, { data: oneTime }, { data: subscriptionPayments }] =
    await Promise.all([
      supabase
        .from("installments")
        .select("id, sequence, due_date, amount, paid")
        .eq("deal_id", id)
        .order("sequence"),
      supabase
        .from("one_time_payments")
        .select("paid, paid_at, due_date")
        .eq("deal_id", id)
        .maybeSingle(),
      isSubscription
        ? supabase
            .from("subscription_payments")
            .select("id, sequence, due_date, amount, paid")
            .eq("deal_id", id)
            .order("sequence")
        : Promise.resolve({ data: [] }),
    ]);

  const d = deal;
  type InstallmentRow = { id: string; sequence: number; due_date: string; amount: number; paid: boolean };
  type SubPaymentRow = { id: string; sequence: number; due_date: string; amount: number; paid: boolean };

  const isAdmin = session.role === "admin";

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/deals"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ChevronLeft className="h-4 w-4" />
            Zurück zu Deals
          </Link>
          <h1 className="text-xl font-semibold">{d.customer_name}</h1>
          {d.order_id && (
            <p className="text-sm text-muted-foreground mt-0.5">
              #{d.order_id}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/deals/${id}/pdf`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <FileDown className="mr-1.5 h-3.5 w-3.5" />
            PDF
          </a>
          {isAdmin && (
            <Link
              href={`/deals/${id}/edit`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Bearbeiten
            </Link>
          )}
        </div>
      </div>

      {/* Deal details */}
      <div className="rounded-lg border border-border p-4 space-y-0">
        <Row label="Produkt" value={d.products?.name} />
        <Row label="Plattform" value={d.platforms?.name} />
        <Row label="Zahlart" value={d.payment_method} />
        <Row
          label="Closer"
          value={
            d.closers?.name ??
            (d as { sales_partners?: { name: string } | null }).sales_partners?.name ??
            (d as { closer_manual?: string | null }).closer_manual ??
            undefined
          }
        />
        <Row
          label="Gesamtpreis"
          value={
            <span className="font-medium tabular-nums">
              {new Intl.NumberFormat("de-DE", {
                style: "currency",
                currency: "EUR",
              }).format(d.total_price)}
            </span>
          }
        />
        {d.is_upsell && d.upsell_amount != null && (
          <>
            <Row
              label="Upsell"
              value={
                <span className="tabular-nums">
                  {new Intl.NumberFormat("de-DE", {
                    style: "currency",
                    currency: "EUR",
                  }).format(d.upsell_amount)}{" "}
                  <span className={d.upsell_paid ? "text-emerald-400" : "text-amber-400"}>
                    ({d.upsell_paid ? "bezahlt" : "offen"})
                  </span>
                  {d.upsell_order_id && (
                    <span className="text-muted-foreground"> · #{d.upsell_order_id}</span>
                  )}
                </span>
              }
            />
            <Row
              label="Gesamt (inkl. Upsell)"
              value={
                <span className="font-semibold tabular-nums">
                  {new Intl.NumberFormat("de-DE", {
                    style: "currency",
                    currency: "EUR",
                  }).format(d.total_price + d.upsell_amount)}
                </span>
              }
            />
          </>
        )}
        {d.down_payment != null && (
          <Row
            label="Anzahlung"
            value={
              <span className="tabular-nums text-emerald-400">
                {new Intl.NumberFormat("de-DE", {
                  style: "currency",
                  currency: "EUR",
                }).format(d.down_payment)}
              </span>
            }
          />
        )}
        {isSubscription && (d as { recurring_amount?: number | null }).recurring_amount != null && (
          <Row
            label="Abo-Betrag"
            value={
              <span className="font-medium tabular-nums text-violet-400">
                {new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
                  (d as { recurring_amount: number }).recurring_amount,
                )}
                {d.payment_type === "subscription_monthly" ? "/Monat" : "/Jahr"}
              </span>
            }
          />
        )}
        <Row label="Zahlungsart" value={PAYMENT_LABEL[d.payment_type] ?? d.payment_type} />
        <Row
          label="Abschluss"
          value={format(new Date(d.close_date), "dd. MMMM yyyy", {
            locale: de,
          })}
        />
        <Row
          label="Onboarding"
          value={<StatusBadge active={d.onboarding_done} label={d.onboarding_done ? "Erledigt" : "Ausstehend"} />}
        />
        <Row
          label="Update-Call"
          value={<StatusBadge active={d.update_call_done} label={d.update_call_done ? "Erledigt" : "Ausstehend"} />}
        />
        {(d as { chargeback?: boolean }).chargeback && (
          <Row
            label="Rückbuchung"
            value={<span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-amber-500/15 text-amber-400">Ja — Zahlung zurückgebucht</span>}
          />
        )}
        {(d as { storniert?: boolean }).storniert && (
          <Row
            label="Storniert"
            value={<span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-rose-500/15 text-rose-400">Ja — Vertrag storniert</span>}
          />
        )}
        {d.notes && <Row label="Notizen" value={d.notes} />}
      </div>

      {/* Zahlung / Anzahlung status — für Einmalzahlung immer, für Ratenzahlung
          nur bei tatsächlicher Anzahlung (down_payment). Verhindert, dass ein
          verwaister one_time_payment-Record (z.B. aus Import) fälschlich als
          „Anzahlung bezahlt" erscheint, obwohl keine Anzahlung vereinbart war. */}
      {!isSubscription &&
        oneTime &&
        (d.payment_type === "one_time" ||
          (d.down_payment != null && d.down_payment > 0)) && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <h2 className="text-sm font-semibold">
            {d.payment_type === "one_time" ? "Zahlung" : "Anzahlung"}
          </h2>
          {oneTime.due_date && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Fällig am</span>
              <span className="text-sm tabular-nums">
                {format(new Date(oneTime.due_date), "dd. MMMM yyyy", { locale: de })}
              </span>
            </div>
          )}
          {d.payment_type === "installments" && d.down_payment != null && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Betrag</span>
              <span className="text-sm tabular-nums font-medium text-emerald-400">
                {new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(d.down_payment)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <OneTimeToggle dealId={id} paid={oneTime.paid} />
          </div>
        </div>
      )}

      {/* Anmeldegebühr bei Abo-Deals */}
      {isSubscription && oneTime && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <h2 className="text-sm font-semibold">Anmeldegebühr</h2>
          {oneTime.due_date && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Fällig am</span>
              <span className="text-sm tabular-nums">
                {format(new Date(oneTime.due_date), "dd. MMMM yyyy", { locale: de })}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <OneTimeToggle dealId={id} paid={oneTime.paid} />
          </div>
        </div>
      )}

      {/* Abo-Zahlungs-Tracker */}
      {isSubscription && (
        <SubscriptionTracker
          dealId={id}
          payments={(subscriptionPayments ?? []) as SubPaymentRow[]}
          defaultAmount={(d as { recurring_amount?: number | null }).recurring_amount ?? 0}
          interval={d.payment_type === "subscription_monthly" ? "monthly" : "yearly"}
          isAdmin={isAdmin}
        />
      )}

      {/* Raten nachtragen — für importierte Deals ohne Raten */}
      {d.payment_type === "installments" && (!installments || installments.length === 0) && (
        <AddInstallmentsForm
          dealId={id}
          totalPrice={d.total_price}
          downPayment={d.down_payment ?? null}
        />
      )}

      {/* Installments table */}
      {d.payment_type === "installments" && installments && installments.length > 0 && (
        <InstallmentsTracker
          dealId={id}
          installments={installments as InstallmentRow[]}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}

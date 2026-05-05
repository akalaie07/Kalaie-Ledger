"use client";

import { useActionState, useState } from "react";

import { createDeal, type DealFormState } from "@/lib/actions/deals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Option {
  id: string;
  name: string;
}

interface DealFormProps {
  platforms: Option[];
  products: Option[];
  closers: Option[];
  salesPartners: Option[];
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-xs text-destructive">{msg}</p>;
}

function FormSelect({
  name,
  label,
  options,
  required,
  error,
  placeholder = "— keine —",
}: {
  name: string;
  label: string;
  options: Option[];
  required?: boolean;
  error?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      <select
        id={name}
        name={name}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          error && "border-destructive",
        )}
      >
        {!required && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <FieldError msg={error} />
    </div>
  );
}

export function DealForm({
  platforms,
  products,
  closers,
  salesPartners,
}: DealFormProps) {
  const [state, action, pending] = useActionState<DealFormState, FormData>(
    createDeal,
    null,
  );
  const [paymentType, setPaymentType] = useState<"one_time" | "installments">(
    "one_time",
  );

  const fe = state?.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-6">
      {state?.error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      {/* ── Kerndaten ── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Kerndaten
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="customer_name">
              Kunde <span className="text-destructive">*</span>
            </Label>
            <Input
              id="customer_name"
              name="customer_name"
              required
              aria-invalid={!!fe.customer_name}
            />
            <FieldError msg={fe.customer_name?.[0]} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="order_id">Bestell-ID</Label>
            <Input id="order_id" name="order_id" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormSelect
            name="product_id"
            label="Produkt"
            options={products}
            error={fe.product_id?.[0]}
          />
          <FormSelect
            name="platform_id"
            label="Plattform"
            options={platforms}
            error={fe.platform_id?.[0]}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="payment_method">Zahlart</Label>
          <Input
            id="payment_method"
            name="payment_method"
            placeholder="z.B. Überweisung, Kreditkarte, PayPal"
          />
        </div>
      </section>

      {/* ── Preise & Zahlung ── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Preise & Zahlung
        </h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="total_price">
              Gesamtpreis (€) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="total_price"
              name="total_price"
              type="number"
              min="0"
              step="0.01"
              required
              aria-invalid={!!fe.total_price}
            />
            <FieldError msg={fe.total_price?.[0]} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="close_date">
              Abschlussdatum <span className="text-destructive">*</span>
            </Label>
            <Input
              id="close_date"
              name="close_date"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
              aria-invalid={!!fe.close_date}
            />
            <FieldError msg={fe.close_date?.[0]} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="payment_type">
              Zahlungsart <span className="text-destructive">*</span>
            </Label>
            <select
              id="payment_type"
              name="payment_type"
              value={paymentType}
              onChange={(e) =>
                setPaymentType(e.target.value as "one_time" | "installments")
              }
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="one_time">Einmalzahlung</option>
              <option value="installments">Ratenzahlung</option>
            </select>
          </div>
        </div>

        {paymentType === "installments" && (
          <div className="grid gap-4 sm:grid-cols-2 rounded-lg border border-border bg-muted/20 p-4">
            <div className="space-y-1.5">
              <Label htmlFor="number_of_rates">
                Anzahl Raten <span className="text-destructive">*</span>
              </Label>
              <Input
                id="number_of_rates"
                name="number_of_rates"
                type="number"
                min="2"
                required
                aria-invalid={!!fe.number_of_rates}
              />
              <FieldError msg={fe.number_of_rates?.[0]} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="first_due_date">
                Erstes Fälligkeitsdatum <span className="text-destructive">*</span>
              </Label>
              <Input
                id="first_due_date"
                name="first_due_date"
                type="date"
                required
                aria-invalid={!!fe.first_due_date}
              />
              <FieldError msg={fe.first_due_date?.[0]} />
            </div>
          </div>
        )}
      </section>

      {/* ── Team ── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Team
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormSelect
            name="closer_id"
            label="Closer"
            options={closers}
            error={fe.closer_id?.[0]}
          />
          <FormSelect
            name="sales_partner_id"
            label="Vertriebspartner"
            options={salesPartners}
            error={fe.sales_partner_id?.[0]}
          />
        </div>
      </section>

      {/* ── Status ── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Status
        </h2>

        <div className="flex flex-wrap gap-6">
          {(
            [
              { name: "onboarding_done", label: "Onboarding erledigt" },
              { name: "update_call_done", label: "Update-Call erledigt" },
              { name: "inkasso_required", label: "Inkasso erforderlich" },
            ] as const
          ).map(({ name, label }) => (
            <label key={name} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                name={name}
                value="on"
                className="h-4 w-4 rounded border-input accent-primary"
              />
              {label}
            </label>
          ))}
        </div>
      </section>

      {/* ── Notizen ── */}
      <div className="space-y-1.5">
        <Label htmlFor="notes">Notizen</Label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Wird gespeichert…" : "Deal anlegen"}
        </Button>
        <Button type="button" variant="outline" onClick={() => history.back()}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

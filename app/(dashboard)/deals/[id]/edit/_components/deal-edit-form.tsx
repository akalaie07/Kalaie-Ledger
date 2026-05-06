"use client";

import { useActionState } from "react";

import { updateDeal, type DealFormState } from "@/lib/actions/deals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Option { id: string; name: string }

interface DealEditFormProps {
  dealId: string;
  platforms: Option[];
  products: Option[];
  closers: Option[];
  salesPartners: Option[];
  initial: {
    customer_name: string;
    order_id: string | null;
    product_id: string | null;
    platform_id: string | null;
    payment_method: string | null;
    total_price: number;
    payment_type: "one_time" | "installments";
    close_date: string;
    onboarding_done: boolean;
    update_call_done: boolean;
    inkasso_required: boolean;
    notes: string | null;
    closer_id: string | null;
    sales_partner_id: string | null;
  };
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-xs text-destructive">{msg}</p>;
}

function FormSelect({
  name,
  label,
  options,
  defaultValue,
  error,
}: {
  name: string;
  label: string;
  options: Option[];
  defaultValue?: string | null;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue ?? ""}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          error && "border-destructive",
        )}
      >
        <option value="">— keine —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
      <FieldError msg={error} />
    </div>
  );
}

export function DealEditForm({
  dealId,
  platforms,
  products,
  closers,
  salesPartners,
  initial,
}: DealEditFormProps) {
  const updateDealWithId = updateDeal.bind(null, dealId);
  const [state, action, pending] = useActionState<DealFormState, FormData>(
    updateDealWithId,
    null,
  );

  const fe = state?.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-6">
      {state?.error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      {/* Kerndaten */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Kerndaten</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="customer_name">Kunde <span className="text-destructive">*</span></Label>
            <Input
              id="customer_name"
              name="customer_name"
              required
              defaultValue={initial.customer_name}
              aria-invalid={!!fe.customer_name}
            />
            <FieldError msg={fe.customer_name?.[0]} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="order_id">Bestell-ID</Label>
            <Input id="order_id" name="order_id" defaultValue={initial.order_id ?? ""} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormSelect
            name="product_id"
            label="Produkt"
            options={products}
            defaultValue={initial.product_id}
            error={fe.product_id?.[0]}
          />
          <FormSelect
            name="platform_id"
            label="Plattform"
            options={platforms}
            defaultValue={initial.platform_id}
            error={fe.platform_id?.[0]}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="payment_method">Zahlart</Label>
          <Input
            id="payment_method"
            name="payment_method"
            placeholder="z.B. Überweisung, Kreditkarte, PayPal"
            defaultValue={initial.payment_method ?? ""}
          />
        </div>
      </section>

      {/* Preise & Zahlung */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Preise & Zahlung</h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="total_price">Gesamtpreis (€) <span className="text-destructive">*</span></Label>
            <Input
              id="total_price"
              name="total_price"
              type="number"
              min="0"
              step="0.01"
              required
              defaultValue={initial.total_price}
              aria-invalid={!!fe.total_price}
            />
            <FieldError msg={fe.total_price?.[0]} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="close_date">Abschlussdatum <span className="text-destructive">*</span></Label>
            <Input
              id="close_date"
              name="close_date"
              type="date"
              required
              defaultValue={initial.close_date}
              aria-invalid={!!fe.close_date}
            />
            <FieldError msg={fe.close_date?.[0]} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="payment_type">Zahlungsart <span className="text-destructive">*</span></Label>
            <select
              id="payment_type"
              name="payment_type"
              defaultValue={initial.payment_type}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="one_time">Einmalzahlung</option>
              <option value="installments">Ratenzahlung</option>
            </select>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Hinweis: Änderungen an der Zahlungsart betreffen keine bestehenden Raten.
        </p>
      </section>

      {/* Team */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Team</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormSelect
            name="closer_id"
            label="Closer"
            options={closers}
            defaultValue={initial.closer_id}
            error={fe.closer_id?.[0]}
          />
          <FormSelect
            name="sales_partner_id"
            label="Vertriebspartner"
            options={salesPartners}
            defaultValue={initial.sales_partner_id}
            error={fe.sales_partner_id?.[0]}
          />
        </div>
      </section>

      {/* Status */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Status</h2>

        <div className="flex flex-wrap gap-6">
          {(
            [
              { name: "onboarding_done", label: "Onboarding erledigt", checked: initial.onboarding_done },
              { name: "update_call_done", label: "Update-Call erledigt", checked: initial.update_call_done },
              { name: "inkasso_required", label: "Inkasso erforderlich", checked: initial.inkasso_required },
            ] as const
          ).map(({ name, label, checked }) => (
            <label key={name} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                name={name}
                value="on"
                defaultChecked={checked}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              {label}
            </label>
          ))}
        </div>
      </section>

      {/* Notizen */}
      <div className="space-y-1.5">
        <Label htmlFor="notes">Notizen</Label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={initial.notes ?? ""}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Wird gespeichert…" : "Änderungen speichern"}
        </Button>
        <Button type="button" variant="outline" onClick={() => history.back()}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

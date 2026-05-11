"use client";

import { useActionState, useState } from "react";

import { updateDeal, type DealFormState } from "@/lib/actions/deals";
import { type ProductOption } from "@/app/(dashboard)/deals/new/_components/deal-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Option { id: string; name: string }

interface DealEditFormProps {
  dealId: string;
  platforms: Option[];
  products: ProductOption[];
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
    mahnung_required: boolean;
    inkasso_required: boolean;
    notes: string | null;
    closer_id: string | null;
    sales_partner_id: string | null;
    down_payment: number | null;
    one_time_due_date: string | null;
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
  const initialProduct = products.find((p) => p.id === initial.product_id);
  const [selectedProductId, setSelectedProductId] = useState<string>(initial.product_id ?? "");
  const [selectedProductType, setSelectedProductType] = useState<ProductOption["product_type"]>(
    initialProduct?.product_type ?? "standard",
  );
  const [paymentType, setPaymentType] = useState<"one_time" | "installments">(initial.payment_type);
  const [hasAnzahlung, setHasAnzahlung] = useState(initial.down_payment != null);
  const [salesPartnerMode, setSalesPartnerMode] = useState<"select" | "new">("select");
  const [totalPrice, setTotalPrice] = useState(initial.total_price);
  const [downPayment, setDownPayment] = useState(initial.down_payment ?? 0);
  const [numberOfRates, setNumberOfRates] = useState(0);

  const isSubscription = selectedProductType === "subscription_monthly" || selectedProductType === "subscription_yearly";

  function handleProductChange(productId: string) {
    setSelectedProductId(productId);
    const product = products.find((p) => p.id === productId);
    const type = product?.product_type ?? "standard";
    setSelectedProductType(type);
    if (type === "subscription_monthly" || type === "subscription_yearly") {
      setPaymentType("installments");
    }
  }

  const ratenLabel =
    selectedProductType === "subscription_monthly"
      ? "Laufzeit (Monate)"
      : selectedProductType === "subscription_yearly"
      ? "Laufzeit (Jahre)"
      : "Anzahl Raten";

  function fmtPreview(v: number) {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);
  }

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
          {/* Produkt — controlled, damit Zahlungsart sich automatisch anpasst */}
          <div className="space-y-1.5">
            <Label htmlFor="product_id">Produkt</Label>
            <select
              id="product_id"
              name="product_id"
              value={selectedProductId}
              onChange={(e) => handleProductChange(e.target.value)}
              className={cn(
                "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                fe.product_id && "border-destructive",
              )}
            >
              <option value="">— keine —</option>
              {products.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
            <FieldError msg={fe.product_id?.[0]} />
          </div>
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
              value={totalPrice}
              onChange={(e) => setTotalPrice(parseFloat(e.target.value) || 0)}
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
            {isSubscription ? (
              <div className="rounded-md border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-sm text-violet-300">
                Abo — Ratenzahlung wird automatisch verwendet
              </div>
            ) : (
              <select
                id="payment_type"
                name="payment_type"
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value as "one_time" | "installments")}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="one_time">Einmalzahlung</option>
                <option value="installments">Ratenzahlung</option>
              </select>
            )}
            {isSubscription && (
              <input type="hidden" name="payment_type" value="installments" />
            )}
          </div>
        </div>

        {/* Anzahlung */}
        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hasAnzahlung}
              onChange={(e) => setHasAnzahlung(e.target.checked)}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            Anzahlung geleistet
          </label>

          {hasAnzahlung && (
            <div className="space-y-1.5">
              <Label htmlFor="down_payment">
                Höhe der Anzahlung (€) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="down_payment"
                name="down_payment"
                type="number"
                min="0"
                step="0.01"
                value={downPayment || ""}
                onChange={(e) => setDownPayment(parseFloat(e.target.value) || 0)}
                aria-invalid={!!fe.down_payment}
              />
              <FieldError msg={fe.down_payment?.[0]} />
            </div>
          )}
        </div>

        {/* Fälligkeitsdatum Einmalzahlung */}
        {paymentType === "one_time" && (
          <div className="space-y-1.5">
            <Label htmlFor="one_time_due_date">Zahlung fällig zum</Label>
            <Input
              id="one_time_due_date"
              name="one_time_due_date"
              type="date"
              defaultValue={initial.one_time_due_date ?? ""}
              aria-invalid={!!fe.one_time_due_date}
            />
            <FieldError msg={fe.one_time_due_date?.[0]} />
          </div>
        )}

        {/* Raten-Felder */}
        {paymentType === "installments" && (
          <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="number_of_rates">{ratenLabel}</Label>
                <Input
                  id="number_of_rates"
                  name="number_of_rates"
                  type="number"
                  min="2"
                  value={numberOfRates || ""}
                  onChange={(e) => setNumberOfRates(parseInt(e.target.value) || 0)}
                  aria-invalid={!!fe.number_of_rates}
                  placeholder="z.B. 3"
                />
                <FieldError msg={fe.number_of_rates?.[0]} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="first_due_date">Erstes Fälligkeitsdatum</Label>
                <Input
                  id="first_due_date"
                  name="first_due_date"
                  type="date"
                  aria-invalid={!!fe.first_due_date}
                />
                <FieldError msg={fe.first_due_date?.[0]} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Nur ausfüllen, um bestehende Raten neu zu generieren.
            </p>
            {totalPrice > 0 && numberOfRates >= 2 && (
              (() => {
                const dp = hasAnzahlung ? downPayment : 0;
                const base = totalPrice - dp;
                const perRate = base > 0 ? base / numberOfRates : 0;
                return (
                  <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm">
                    <p className="font-medium text-blue-300 mb-1">Ratenvorschau (Neuberechnung)</p>
                    <p className="text-blue-200/80">
                      {fmtPreview(base)} ÷ {numberOfRates} Raten ={" "}
                      <span className="font-semibold text-blue-100 text-base">{fmtPreview(perRate)} pro Rate</span>
                    </p>
                  </div>
                );
              })()
            )}
          </div>
        )}
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

          {/* Vertriebspartner: aus Liste oder neu anlegen */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor={salesPartnerMode === "select" ? "sales_partner_id" : "new_sales_partner_name"}>
                Vertriebspartner
              </Label>
              <button
                type="button"
                onClick={() => setSalesPartnerMode(salesPartnerMode === "select" ? "new" : "select")}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              >
                {salesPartnerMode === "select" ? "+ Neu anlegen" : "Aus Liste wählen"}
              </button>
            </div>

            {salesPartnerMode === "select" ? (
              <>
                <select
                  id="sales_partner_id"
                  name="sales_partner_id"
                  defaultValue={initial.sales_partner_id ?? ""}
                  className={cn(
                    "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    fe.sales_partner_id && "border-destructive",
                  )}
                >
                  <option value="">— keine —</option>
                  {salesPartners.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
                <FieldError msg={fe.sales_partner_id?.[0]} />
              </>
            ) : (
              <>
                <Input
                  id="new_sales_partner_name"
                  name="new_sales_partner_name"
                  placeholder="Name des Vertriebspartners"
                  aria-invalid={!!fe.new_sales_partner_name}
                />
                <p className="text-xs text-muted-foreground">
                  Wird automatisch in Stammdaten angelegt (0 % Provision — bitte nachpflegen).
                </p>
                <FieldError msg={fe.new_sales_partner_name?.[0]} />
              </>
            )}
          </div>
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
              { name: "mahnung_required", label: "Mahnung erforderlich", checked: initial.mahnung_required },
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

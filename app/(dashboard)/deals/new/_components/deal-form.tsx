"use client";

import { useActionState, useEffect, useState } from "react";

import { createDeal, type DealFormState } from "@/lib/actions/deals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Option {
  id: string;
  name: string;
}

export interface ProductOption {
  id: string;
  name: string;
  product_type: "standard" | "subscription_monthly" | "subscription_yearly";
  registration_fee_options: number[];
  default_recurring_price: number | null;
}

interface DealFormProps {
  platforms: Option[];
  products: ProductOption[];
  closers: Option[];
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
  value,
  onChange,
}: {
  name: string;
  label: string;
  options: Option[];
  required?: boolean;
  error?: string;
  placeholder?: string;
  value?: string;
  onChange?: (val: string) => void;
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
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
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

const fmt = (v: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);

export function DealForm({ platforms, products, closers }: DealFormProps) {
  const [state, action, pending] = useActionState<DealFormState, FormData>(createDeal, null);

  type PaymentModel = "einmalig" | "abo" | "hybrid";
  const [paymentModel, setPaymentModel] = useState<PaymentModel>("einmalig");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedProductType, setSelectedProductType] = useState<
    "standard" | "subscription_monthly" | "subscription_yearly"
  >("standard");

  // Abo-Felder
  const [regFeeChoice, setRegFeeChoice] = useState<string>(""); // "129" | "1" | "custom"
  const [regFeeCustom, setRegFeeCustom] = useState<number>(0);
  const [recurringAmount, setRecurringAmount] = useState<number>(0);
  const [subscriptionStart, setSubscriptionStart] = useState<string>("");

  // Standard / Hybrid-Felder
  const [aufnahmegebuehr, setAufnahmegebuehr] = useState<number>(0);
  const [monthlyAmount, setMonthlyAmount] = useState<number>(0);
  const [laufzeit, setLaufzeit] = useState<number>(0);

  const [closeDate, setCloseDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [closerId, setCloserId] = useState<string>("");

  const isSubscription =
    selectedProductType === "subscription_monthly" ||
    selectedProductType === "subscription_yearly";

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const regFeeOptions = selectedProduct?.registration_fee_options ?? [];

  // Effektiver Anmeldegebühr-Betrag
  const effectiveRegFee =
    regFeeChoice === "custom"
      ? regFeeCustom
      : regFeeChoice !== ""
      ? parseFloat(regFeeChoice)
      : 0;

  // Berechnete Werte für hidden inputs
  const computedPaymentType: string = (() => {
    if (paymentModel === "einmalig") return "one_time";
    if (isSubscription) return selectedProductType; // subscription_monthly | subscription_yearly
    return "installments";
  })();

  const computedTotalPrice = (() => {
    if (paymentModel === "einmalig") return aufnahmegebuehr;
    if (isSubscription) return effectiveRegFee; // Anmeldegebühr = total_price bei Abos
    if (paymentModel === "abo") return monthlyAmount * laufzeit;
    return aufnahmegebuehr + monthlyAmount * laufzeit; // hybrid standard
  })();

  const computedDownPayment =
    paymentModel === "hybrid" && !isSubscription ? aufnahmegebuehr : null;

  // Letztes Datum + letzten Closer aus localStorage laden
  useEffect(() => {
    const savedDate = localStorage.getItem("kalaie_last_close_date");
    if (savedDate) setCloseDate(savedDate);
    const savedCloser = localStorage.getItem("kalaie_last_closer_id");
    if (savedCloser && closers.some((c) => c.id === savedCloser)) setCloserId(savedCloser);
  }, [closers]);

  function handleCloseDateChange(val: string) {
    setCloseDate(val);
    if (val) localStorage.setItem("kalaie_last_close_date", val);
  }

  function handleCloserChange(val: string) {
    setCloserId(val);
    if (val) localStorage.setItem("kalaie_last_closer_id", val);
    else localStorage.removeItem("kalaie_last_closer_id");
  }

  function handleProductChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    setSelectedProductId(id);
    const product = products.find((p) => p.id === id);
    const pt = product?.product_type ?? "standard";
    setSelectedProductType(pt);

    if (pt === "subscription_monthly" || pt === "subscription_yearly") {
      setPaymentModel("abo");
      // Standardwerte aus Produkt vorausfüllen
      if (product?.default_recurring_price) setRecurringAmount(product.default_recurring_price);
      if ((product?.registration_fee_options ?? []).length > 0) {
        setRegFeeChoice(String(product!.registration_fee_options[0]));
      }
    }
  }

  const laufzeitLabel =
    selectedProductType === "subscription_monthly"
      ? "Laufzeit (Monate)"
      : selectedProductType === "subscription_yearly"
      ? "Laufzeit (Jahre)"
      : "Anzahl Raten";

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
          <div className="space-y-1.5">
            <Label htmlFor="product_id">Produkt</Label>
            <select
              id="product_id"
              name="product_id"
              value={selectedProductId}
              onChange={handleProductChange}
              className={cn(
                "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                fe.product_id && "border-destructive",
              )}
            >
              <option value="">— keine —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {fe.product_id && <p className="text-xs text-destructive">{fe.product_id[0]}</p>}
          </div>
          <FormSelect
            name="platform_id"
            label="Plattform"
            options={platforms}
            error={fe.platform_id?.[0]}
          />
        </div>
      </section>

      {/* ── Preise & Zahlung ── */}
      <section className="space-y-5">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Preise & Zahlung
        </h2>

        {/* Hidden computed fields */}
        <input type="hidden" name="payment_type" value={computedPaymentType} />
        <input type="hidden" name="total_price" value={computedTotalPrice || 0} />
        {computedDownPayment !== null && (
          <input type="hidden" name="down_payment" value={computedDownPayment} />
        )}
        {isSubscription && paymentModel === "abo" && (
          <>
            <input type="hidden" name="recurring_amount" value={recurringAmount || 0} />
            {subscriptionStart && (
              <input type="hidden" name="subscription_start_date" value={subscriptionStart} />
            )}
          </>
        )}

        {/* Abschlussdatum */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="close_date">
              Abschlussdatum <span className="text-destructive">*</span>
            </Label>
            <Input
              id="close_date"
              name="close_date"
              type="date"
              required
              value={closeDate}
              onChange={(e) => handleCloseDateChange(e.target.value)}
              aria-invalid={!!fe.close_date}
            />
            <FieldError msg={fe.close_date?.[0]} />
          </div>
        </div>

        {/* Zahlungsmodell-Auswahl */}
        <div className="space-y-2">
          <Label>Zahlungsmodell <span className="text-destructive">*</span></Label>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { value: "einmalig", label: "Einmalzahlung" },
                { value: "abo", label: "Abo / Wiederkehrend" },
                { value: "hybrid", label: "Hybrid" },
              ] as const
            ).map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setPaymentModel(value)}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                  paymentModel === value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── ABO-Modell (Subscription) ─────────────────────────── */}
        {paymentModel === "abo" && isSubscription && (
          <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-4 space-y-4">
            <h3 className="text-sm font-semibold text-violet-300">
              {selectedProductType === "subscription_monthly" ? "Monatliches Abo" : "Jährliches Abo"}
            </h3>

            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Feld</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Wert</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {/* Anmeldegebühr */}
                  <tr>
                    <td className="px-4 py-3 text-muted-foreground">Anmeldegebühr</td>
                    <td className="px-4 py-3 space-y-2">
                      <select
                        value={regFeeChoice}
                        onChange={(e) => setRegFeeChoice(e.target.value)}
                        className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option value="">— keine / 0 € —</option>
                        {regFeeOptions.map((fee) => (
                          <option key={fee} value={String(fee)}>{fmt(fee)}</option>
                        ))}
                        <option value="custom">Benutzerdefiniert…</option>
                      </select>
                      {regFeeChoice === "custom" && (
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="Betrag in €"
                          value={regFeeCustom || ""}
                          onChange={(e) => setRegFeeCustom(parseFloat(e.target.value) || 0)}
                          className="h-8 text-sm"
                        />
                      )}
                    </td>
                  </tr>
                  {/* Wiederkehrender Betrag */}
                  <tr>
                    <td className="px-4 py-3 text-muted-foreground">
                      {selectedProductType === "subscription_monthly" ? "Monatlicher Betrag" : "Jährlicher Betrag"}{" "}
                      <span className="text-destructive">*</span>
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0,00"
                        value={recurringAmount || ""}
                        onChange={(e) => setRecurringAmount(parseFloat(e.target.value) || 0)}
                        className="h-8 text-sm"
                      />
                    </td>
                  </tr>
                  {/* Abo-Start */}
                  <tr>
                    <td className="px-4 py-3 text-muted-foreground">Abo-Start</td>
                    <td className="px-4 py-3">
                      <Input
                        type="date"
                        value={subscriptionStart}
                        onChange={(e) => setSubscriptionStart(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Vorschau */}
            {(effectiveRegFee > 0 || recurringAmount > 0) && (
              <div className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-sm">
                <p className="font-medium text-violet-300 mb-1">Vorschau</p>
                <div className="space-y-0.5 text-violet-200/80">
                  {effectiveRegFee > 0 && <p>Anmeldegebühr: <span className="font-semibold text-violet-100">{fmt(effectiveRegFee)}</span></p>}
                  {recurringAmount > 0 && (
                    <p>
                      + {fmt(recurringAmount)}/{selectedProductType === "subscription_monthly" ? "Monat" : "Jahr"}{" "}
                      <span className="text-violet-300/60">(monatlich kündbar)</span>
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Einmalige Zahlung ── */}
        {(paymentModel === "einmalig" || (paymentModel === "hybrid" && !isSubscription)) && (
          <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-4">
            <h3 className="text-sm font-semibold">Einmalige Zahlung</h3>
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Feld</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Wert</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="px-4 py-3 text-muted-foreground">
                      {paymentModel === "hybrid" ? "Aufnahmegebühr" : "Betrag"}{" "}
                      <span className="text-destructive">*</span>
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0,00"
                        value={aufnahmegebuehr || ""}
                        onChange={(e) => setAufnahmegebuehr(parseFloat(e.target.value) || 0)}
                        className="h-8 text-sm"
                        aria-invalid={!!fe.total_price}
                      />
                      <FieldError msg={fe.total_price?.[0]} />
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-muted-foreground">Fällig am</td>
                    <td className="px-4 py-3">
                      <Input
                        id="one_time_due_date"
                        name="one_time_due_date"
                        type="date"
                        className="h-8 text-sm"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Wiederkehrende Zahlung (Standard-Ratenzahlung) ── */}
        {(paymentModel === "abo" || paymentModel === "hybrid") && !isSubscription && (
          <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-4">
            <h3 className="text-sm font-semibold">Wiederkehrende Zahlung</h3>
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Feld</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Wert</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="px-4 py-3 text-muted-foreground">
                      Betrag pro Rate <span className="text-destructive">*</span>
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0,00"
                        value={monthlyAmount || ""}
                        onChange={(e) => setMonthlyAmount(parseFloat(e.target.value) || 0)}
                        className="h-8 text-sm"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-muted-foreground">
                      {laufzeitLabel} <span className="text-destructive">*</span>
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        id="number_of_rates"
                        name="number_of_rates"
                        type="number"
                        min="1"
                        placeholder="z.B. 12"
                        value={laufzeit || ""}
                        onChange={(e) => setLaufzeit(parseInt(e.target.value) || 0)}
                        className="h-8 text-sm"
                        required
                        aria-invalid={!!fe.number_of_rates}
                      />
                      <FieldError msg={fe.number_of_rates?.[0]} />
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-muted-foreground">
                      Erstes Fälligkeitsdatum <span className="text-destructive">*</span>
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        id="first_due_date"
                        name="first_due_date"
                        type="date"
                        required
                        className="h-8 text-sm"
                        aria-invalid={!!fe.first_due_date}
                      />
                      <FieldError msg={fe.first_due_date?.[0]} />
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-muted-foreground">Kündigungsfrist</td>
                    <td className="px-4 py-3">
                      <Input
                        id="payment_method"
                        name="payment_method"
                        placeholder="z.B. Monatlich kündbar"
                        className="h-8 text-sm"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {monthlyAmount > 0 && laufzeit >= 1 && (
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm">
                <p className="font-medium text-blue-300 mb-1">Vorschau</p>
                <div className="space-y-0.5 text-blue-200/80">
                  <p>
                    {fmt(monthlyAmount)} × {laufzeit} Perioden ={" "}
                    <span className="font-semibold text-blue-100">{fmt(monthlyAmount * laufzeit)}</span>
                  </p>
                  {paymentModel === "hybrid" && aufnahmegebuehr > 0 && (
                    <p>
                      + {fmt(aufnahmegebuehr)} Aufnahmegebühr ={" "}
                      <span className="font-semibold text-blue-100 text-base">{fmt(computedTotalPrice)}</span> Gesamt
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Gesamtpreis-Anzeige */}
        {computedTotalPrice > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3">
            <span className="text-sm text-muted-foreground">
              {isSubscription && paymentModel === "abo" ? "Anmeldegebühr" : "Gesamtpreis (berechnet)"}
            </span>
            <span className="font-semibold tabular-nums">{fmt(computedTotalPrice)}</span>
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
            value={closerId}
            onChange={handleCloserChange}
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
              { name: "mahnung_required", label: "Mahnung erforderlich" },
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
        <div className="rounded-lg border border-red-900/40 bg-red-900/10 px-4 py-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer text-red-400">
            <input
              type="checkbox"
              name="chargeback"
              value="on"
              className="h-4 w-4 rounded border-red-800 accent-red-700"
            />
            Rückbuchung — Zahlung wurde zurückgebucht / storniert
          </label>
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

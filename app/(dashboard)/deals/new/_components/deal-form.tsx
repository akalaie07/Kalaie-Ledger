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
  default_price: number | null;
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

const fmt = (v: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);

type PaymentModel = "einmalig" | "ratenzahlung" | "abo";

export function DealForm({ platforms, products, closers }: DealFormProps) {
  const [state, action, pending] = useActionState<DealFormState, FormData>(createDeal, null);

  const [paymentModel, setPaymentModel] = useState<PaymentModel>("einmalig");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedProductType, setSelectedProductType] = useState<ProductOption["product_type"]>("standard");

  // Einmalzahlung
  const [einmaligBetrag, setEinmaligBetrag] = useState(0);
  const [einmaligFaellig, setEinmaligFaellig] = useState("");

  // Ratenzahlung
  const [gesamtbetrag, setGesamtbetrag] = useState(0);
  const [numberOfRates, setNumberOfRates] = useState(0);
  const [firstDueDate, setFirstDueDate] = useState("");

  // Anzahlung (shared für EZ und Ratenzahlung)
  const [hasAnzahlung, setHasAnzahlung] = useState(false);
  const [downPayment, setDownPayment] = useState(0);
  const [downPaymentDate, setDownPaymentDate] = useState("");

  // Abo
  const [regFeeChoice, setRegFeeChoice] = useState("");
  const [regFeeCustom, setRegFeeCustom] = useState(0);
  const [recurringAmount, setRecurringAmount] = useState(0);
  const [subscriptionStart, setSubscriptionStart] = useState("");

  // Shared
  const [closeDate, setCloseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [closerId, setCloserId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");

  const isSubscription =
    selectedProductType === "subscription_monthly" ||
    selectedProductType === "subscription_yearly";

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const regFeeOptions = selectedProduct?.registration_fee_options ?? [];

  const effectiveRegFee =
    regFeeChoice === "custom"
      ? regFeeCustom
      : regFeeChoice !== ""
      ? parseFloat(regFeeChoice)
      : 0;

  // localStorage – letztes Datum + Closer merken
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
      if (product?.default_recurring_price) setRecurringAmount(product.default_recurring_price);
      if ((product?.registration_fee_options ?? []).length > 0) {
        setRegFeeChoice(String(product!.registration_fee_options[0]));
      }
    } else {
      if (paymentModel === "abo") setPaymentModel("einmalig");
      if (product?.default_price) {
        setEinmaligBetrag(product.default_price);
        setGesamtbetrag(product.default_price);
      }
    }
  }

  // Computed values für hidden inputs
  const computedPaymentType = (() => {
    if (paymentModel === "abo" && isSubscription) return selectedProductType;
    if (paymentModel === "ratenzahlung") return "installments";
    return "one_time";
  })();

  const computedTotalPrice = (() => {
    if (paymentModel === "abo" && isSubscription) return effectiveRegFee;
    // Ratenzahlung: Gesamtbetrag wie angegeben
    if (paymentModel === "ratenzahlung")
      return gesamtbetrag;
    // Einmalzahlung: total_price = einmaligBetrag (Anzahlung ist Teil des Betrags)
    return einmaligBetrag;
  })();

  // one_time_due_date: Anzahlungsdatum wenn aktiv, sonst EZ-Fälligkeitsdatum
  const computedOneTimeDueDate = (() => {
    if (paymentModel === "abo") return null;
    if (hasAnzahlung) return downPaymentDate || null;
    if (paymentModel === "einmalig") return einmaligFaellig || null;
    return null;
  })();

  const fe = state?.fieldErrors ?? {};

  const tabs: { value: PaymentModel; label: string; disabled: boolean }[] = [
    { value: "einmalig", label: "Einmalzahlung", disabled: isSubscription },
    { value: "ratenzahlung", label: "Ratenzahlung", disabled: isSubscription },
    { value: "abo", label: "Abo / Wiederkehrend", disabled: !isSubscription },
  ];

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
              )}
            >
              <option value="">— keine —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="platform_id">Plattform</Label>
            <select
              id="platform_id"
              name="platform_id"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">— keine —</option>
              {platforms.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
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
        {hasAnzahlung && paymentModel !== "abo" && downPayment > 0 && (
          <input type="hidden" name="down_payment" value={downPayment} />
        )}
        {computedOneTimeDueDate && (
          <input type="hidden" name="one_time_due_date" value={computedOneTimeDueDate} />
        )}
        {paymentModel === "abo" && isSubscription && (
          <>
            <input type="hidden" name="recurring_amount" value={recurringAmount || 0} />
            {subscriptionStart && (
              <input type="hidden" name="subscription_start_date" value={subscriptionStart} />
            )}
          </>
        )}
        {/* payment_method für Abo (wo kein sichtbares Feld existiert) */}
        {paymentModel === "abo" && (
          <input type="hidden" name="payment_method" value={paymentMethod} />
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

        {/* Zahlungsmodell-Tabs */}
        <div className="space-y-2">
          <Label>
            Zahlungsmodell <span className="text-destructive">*</span>
          </Label>
          <div className="grid grid-cols-3 gap-2">
            {tabs.map(({ value, label, disabled }) => (
              <button
                key={value}
                type="button"
                onClick={() => !disabled && setPaymentModel(value)}
                disabled={disabled}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                  paymentModel === value
                    ? "border-primary bg-primary/10 text-primary"
                    : disabled
                    ? "border-border/30 text-muted-foreground/30 cursor-not-allowed"
                    : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {isSubscription && (
            <p className="text-xs text-muted-foreground">
              Abo-Typ wird automatisch durch das gewählte Produkt bestimmt.
            </p>
          )}
        </div>

        {/* ── Einmalzahlung ── */}
        {paymentModel === "einmalig" && (
          <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-4">
            <h3 className="text-sm font-semibold">Einmalige Zahlung</h3>
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground w-[40%]">Feld</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Wert</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="px-4 py-3 text-muted-foreground">
                      Betrag <span className="text-destructive">*</span>
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        type="number" min="0" step="0.01" placeholder="0,00"
                        value={einmaligBetrag || ""}
                        onChange={(e) => setEinmaligBetrag(parseFloat(e.target.value) || 0)}
                        className="h-8 text-sm"
                        aria-invalid={!!fe.total_price}
                      />
                      <FieldError msg={fe.total_price?.[0]} />
                    </td>
                  </tr>
                  {!hasAnzahlung && (
                    <tr>
                      <td className="px-4 py-3 text-muted-foreground">Fällig am</td>
                      <td className="px-4 py-3">
                        <Input
                          type="date"
                          value={einmaligFaellig}
                          onChange={(e) => setEinmaligFaellig(e.target.value)}
                          className="h-8 text-sm"
                        />
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td className="px-4 py-3 text-muted-foreground">Zahlart</td>
                    <td className="px-4 py-3">
                      <Input
                        name="payment_method"
                        placeholder="z.B. Überweisung, Kreditkarte"
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-muted-foreground">Anzahlung</td>
                    <td className="px-4 py-3">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={hasAnzahlung}
                          onChange={(e) => setHasAnzahlung(e.target.checked)}
                          className="h-4 w-4 rounded border-input accent-primary"
                        />
                        Anzahlung geleistet
                      </label>
                    </td>
                  </tr>
                  {hasAnzahlung && (
                    <>
                      <tr>
                        <td className="px-4 py-3 text-muted-foreground">
                          Anzahlungsbetrag <span className="text-destructive">*</span>
                        </td>
                        <td className="px-4 py-3">
                          <Input
                            type="number" min="0" step="0.01" placeholder="0,00"
                            value={downPayment || ""}
                            onChange={(e) => setDownPayment(parseFloat(e.target.value) || 0)}
                            className="h-8 text-sm"
                          />
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-muted-foreground">Anzahlung fällig am</td>
                        <td className="px-4 py-3">
                          <Input
                            type="date"
                            value={downPaymentDate}
                            onChange={(e) => setDownPaymentDate(e.target.value)}
                            className="h-8 text-sm"
                          />
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
            {einmaligBetrag > 0 && (
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-2.5">
                <span className="text-sm text-muted-foreground">Gesamtpreis</span>
                <span className="font-semibold tabular-nums">{fmt(einmaligBetrag)}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Ratenzahlung ── */}
        {paymentModel === "ratenzahlung" && (
          <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-4">
            <h3 className="text-sm font-semibold">Ratenzahlung</h3>
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground w-[40%]">Feld</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Wert</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="px-4 py-3 text-muted-foreground">
                      Gesamtbetrag <span className="text-destructive">*</span>
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        type="number" min="0" step="0.01" placeholder="0,00"
                        value={gesamtbetrag || ""}
                        onChange={(e) => setGesamtbetrag(parseFloat(e.target.value) || 0)}
                        className="h-8 text-sm"
                        aria-invalid={!!fe.total_price}
                      />
                      <FieldError msg={fe.total_price?.[0]} />
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-muted-foreground">
                      Anzahl Raten <span className="text-destructive">*</span>
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        name="number_of_rates"
                        type="number" min="1" placeholder="z.B. 3"
                        value={numberOfRates || ""}
                        onChange={(e) => setNumberOfRates(parseInt(e.target.value) || 0)}
                        className="h-8 text-sm"
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
                        name="first_due_date"
                        type="date"
                        value={firstDueDate}
                        onChange={(e) => setFirstDueDate(e.target.value)}
                        className="h-8 text-sm"
                        aria-invalid={!!fe.first_due_date}
                      />
                      <FieldError msg={fe.first_due_date?.[0]} />
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-muted-foreground">Betrag pro Rate</td>
                    <td className="px-4 py-3">
                      {gesamtbetrag > 0 && numberOfRates >= 1 ? (
                        <span className="font-semibold tabular-nums">
                          {fmt((gesamtbetrag - (hasAnzahlung ? downPayment : 0)) / numberOfRates)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50 text-xs">
                          Wird berechnet…
                        </span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-muted-foreground">Zahlart / Kündigungsfrist</td>
                    <td className="px-4 py-3">
                      <Input
                        name="payment_method"
                        placeholder="z.B. Monatlich kündbar"
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-muted-foreground">Anzahlung</td>
                    <td className="px-4 py-3">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={hasAnzahlung}
                          onChange={(e) => setHasAnzahlung(e.target.checked)}
                          className="h-4 w-4 rounded border-input accent-primary"
                        />
                        Anzahlung geleistet
                      </label>
                    </td>
                  </tr>
                  {hasAnzahlung && (
                    <>
                      <tr>
                        <td className="px-4 py-3 text-muted-foreground">
                          Anzahlungsbetrag <span className="text-destructive">*</span>
                        </td>
                        <td className="px-4 py-3">
                          <Input
                            type="number" min="0" step="0.01" placeholder="0,00"
                            value={downPayment || ""}
                            onChange={(e) => setDownPayment(parseFloat(e.target.value) || 0)}
                            className="h-8 text-sm"
                          />
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-muted-foreground">Anzahlung fällig am</td>
                        <td className="px-4 py-3">
                          <Input
                            type="date"
                            value={downPaymentDate}
                            onChange={(e) => setDownPaymentDate(e.target.value)}
                            className="h-8 text-sm"
                          />
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>

            {gesamtbetrag > 0 && numberOfRates >= 1 && (
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm">
                <p className="font-medium text-blue-300 mb-1">Vorschau</p>
                <div className="space-y-0.5 text-blue-200/80">
                  {hasAnzahlung && downPayment > 0 && (
                    <p>
                      {fmt(gesamtbetrag)} − {fmt(downPayment)} Anzahlung ={" "}
                      <span className="font-semibold text-blue-100">{fmt(gesamtbetrag - downPayment)}</span>
                    </p>
                  )}
                  <p>
                    {fmt(gesamtbetrag - (hasAnzahlung ? downPayment : 0))} ÷ {numberOfRates} Raten ={" "}
                    <span className="font-semibold text-blue-100 text-base">
                      {fmt((gesamtbetrag - (hasAnzahlung ? downPayment : 0)) / numberOfRates)} pro Rate
                    </span>
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Abo ── */}
        {paymentModel === "abo" && isSubscription && (
          <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-4 space-y-4">
            <h3 className="text-sm font-semibold text-violet-300">
              {selectedProductType === "subscription_monthly" ? "Monatliches Abo" : "Jährliches Abo"}
            </h3>
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground w-[40%]">Feld</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Wert</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
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
                          type="number" min="0" step="0.01" placeholder="Betrag in €"
                          value={regFeeCustom || ""}
                          onChange={(e) => setRegFeeCustom(parseFloat(e.target.value) || 0)}
                          className="h-8 text-sm"
                        />
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-muted-foreground">
                      {selectedProductType === "subscription_monthly" ? "Monatlicher Betrag" : "Jährlicher Betrag"}{" "}
                      <span className="text-destructive">*</span>
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        type="number" min="0" step="0.01" placeholder="0,00"
                        value={recurringAmount || ""}
                        onChange={(e) => setRecurringAmount(parseFloat(e.target.value) || 0)}
                        className="h-8 text-sm"
                      />
                    </td>
                  </tr>
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
            {(effectiveRegFee > 0 || recurringAmount > 0) && (
              <div className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-sm">
                <p className="font-medium text-violet-300 mb-1">Vorschau</p>
                <div className="space-y-0.5 text-violet-200/80">
                  {effectiveRegFee > 0 && (
                    <p>
                      Anmeldegebühr:{" "}
                      <span className="font-semibold text-violet-100">{fmt(effectiveRegFee)}</span>
                    </p>
                  )}
                  {recurringAmount > 0 && (
                    <p>
                      + {fmt(recurringAmount)}/
                      {selectedProductType === "subscription_monthly" ? "Monat" : "Jahr"}{" "}
                      <span className="text-violet-300/60">(monatlich kündbar)</span>
                    </p>
                  )}
                </div>
              </div>
            )}
            {effectiveRegFee > 0 && (
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-2.5">
                <span className="text-sm text-muted-foreground">Anmeldegebühr</span>
                <span className="font-semibold tabular-nums">{fmt(effectiveRegFee)}</span>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Team ── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Team
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="closer_id">Closer</Label>
            <select
              id="closer_id"
              name="closer_id"
              value={closerId}
              onChange={(e) => handleCloserChange(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">— keine —</option>
              {closers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <FieldError msg={fe.closer_id?.[0]} />
          </div>
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

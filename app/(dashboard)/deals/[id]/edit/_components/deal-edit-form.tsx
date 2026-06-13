"use client";

import { useActionState, useEffect, useState } from "react";

import { updateDeal, type DealFormState } from "@/lib/actions/deals";
import { type ProductOption } from "@/app/(dashboard)/deals/new/_components/deal-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Option { id: string; name: string }

type PaymentModel = "einmalig" | "ratenzahlung" | "abo";

interface DealEditFormProps {
  dealId: string;
  platforms: Option[];
  products: ProductOption[];
  closers: Option[];
  initial: {
    customer_name: string;
    order_id: string | null;
    product_id: string | null;
    platform_id: string | null;
    payment_method: string | null;
    total_price: number;
    payment_type: "one_time" | "installments" | "subscription_monthly" | "subscription_yearly";
    close_date: string;
    onboarding_done: boolean;
    update_call_done: boolean;
    mahnung_required: boolean;
    inkasso_required: boolean;
    chargeback: boolean;
    storniert: boolean;
    notes: string | null;
    closer_id: string | null;
    down_payment: number | null;
    one_time_due_date: string | null;
    recurring_amount: number | null;
    subscription_start_date: string | null;
    inst_amount: number | null;
    inst_count: number | null;
    first_due_date: string | null;
    reg_fee_paid: boolean;
    is_upsell: boolean;
    upsell_order_id: string | null;
    upsell_product_id: string | null;
    upsell_amount: number | null;
    upsell_paid: boolean;
    coaching_until: string | null;
  };
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-xs text-destructive">{msg}</p>;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);

function paymentTypeToModel(pt: string): PaymentModel {
  if (pt === "installments") return "ratenzahlung";
  if (pt === "subscription_monthly" || pt === "subscription_yearly") return "abo";
  return "einmalig";
}

export function DealEditForm({ dealId, platforms, products, closers, initial }: DealEditFormProps) {
  const updateDealWithId = updateDeal.bind(null, dealId);
  const [state, action, pending] = useActionState<DealFormState, FormData>(updateDealWithId, null);

  // Derive init helpers
  const initialProduct = products.find((p) => p.id === initial.product_id);
  const initIsSubscription =
    initial.payment_type === "subscription_monthly" ||
    initial.payment_type === "subscription_yearly";
  const initHasAnzahlung = (initial.down_payment ?? 0) > 0;
  const initRegFeeOptions = initialProduct?.registration_fee_options ?? [];
  const initRegFeeChoice =
    initIsSubscription && initial.total_price > 0
      ? initRegFeeOptions.includes(initial.total_price)
        ? String(initial.total_price)
        : "custom"
      : "";
  const initRegFeeCustom =
    initIsSubscription && initRegFeeChoice === "custom" ? initial.total_price : 0;

  // ── Core state ──
  const [paymentModel, setPaymentModel] = useState<PaymentModel>(
    paymentTypeToModel(initial.payment_type),
  );
  const [selectedProductId, setSelectedProductId] = useState(initial.product_id ?? "");
  // Fallback auf den payment_type des Deals: auch wenn das Produkt fehlt oder
  // nicht (mehr) in der Liste ist, darf ein Abo-Deal nicht als "standard"
  // behandelt werden — sonst würde Speichern ihn zur Einmalzahlung degradieren.
  const [selectedProductType, setSelectedProductType] = useState<ProductOption["product_type"]>(
    initialProduct?.product_type ??
      (initial.payment_type === "subscription_monthly" || initial.payment_type === "subscription_yearly"
        ? initial.payment_type
        : "standard"),
  );

  // ── Einmalzahlung ──
  const [einmaligBetrag, setEinmaligBetrag] = useState(
    initial.payment_type === "one_time" ? initial.total_price : 0,
  );
  const [einmaligFaellig, setEinmaligFaellig] = useState(
    initial.payment_type === "one_time" && !initHasAnzahlung
      ? (initial.one_time_due_date ?? "")
      : "",
  );

  // ── Ratenzahlung ──
  const [gesamtbetrag, setGesamtbetrag] = useState(
    initial.payment_type === "installments" ? initial.total_price : 0,
  );
  const [numberOfRates, setNumberOfRates] = useState(initial.inst_count ?? 0);
  const [firstDueDate, setFirstDueDate] = useState(initial.first_due_date ?? "");

  // ── Anzahlung (shared EZ + Raten) ──
  const [hasAnzahlung, setHasAnzahlung] = useState(initHasAnzahlung);
  const [downPayment, setDownPayment] = useState(initial.down_payment ?? 0);
  const [downPaymentDate, setDownPaymentDate] = useState(
    initHasAnzahlung ? (initial.one_time_due_date ?? "") : "",
  );

  // ── Abo ──
  const [regFeePaid, setRegFeePaid] = useState(initial.reg_fee_paid);
  const [regFeeChoice, setRegFeeChoice] = useState(initRegFeeChoice);
  const [regFeeCustom, setRegFeeCustom] = useState(initRegFeeCustom);
  const [recurringAmount, setRecurringAmount] = useState(initial.recurring_amount ?? 0);
  const [subscriptionStart, setSubscriptionStart] = useState(
    initial.subscription_start_date ?? "",
  );

  // ── Shared ──
  const [closeDate, setCloseDate] = useState(initial.close_date);
  const [closerId, setCloserId] = useState(initial.closer_id ?? "");
  const [paymentMethod, setPaymentMethod] = useState(initial.payment_method ?? "");

  // ── Upsell + Begleitung ──
  const [isUpsell, setIsUpsell] = useState(initial.is_upsell);
  const [upsellOrderId, setUpsellOrderId] = useState(initial.upsell_order_id ?? "");
  const [upsellProductId, setUpsellProductId] = useState(initial.upsell_product_id ?? "");
  const [upsellAmount, setUpsellAmount] = useState(initial.upsell_amount ?? 0);
  const [upsellPaid, setUpsellPaid] = useState(initial.upsell_paid);
  const [coachingUntil, setCoachingUntil] = useState(initial.coaching_until ?? "");

  // ── localStorage: load per-dealId draft on mount ──
  useEffect(() => {
    const ls = (key: string) => localStorage.getItem(`kalaie_edit_${dealId}_${key}`);

    const savedCloseDate = ls("closeDate");
    if (savedCloseDate) setCloseDate(savedCloseDate);

    const savedCloserId = ls("closerId");
    if (savedCloserId !== null && (savedCloserId === "" || closers.some((c) => c.id === savedCloserId))) {
      setCloserId(savedCloserId);
    }

    const savedModel = ls("paymentModel") as PaymentModel | null;
    if (savedModel && ["einmalig", "ratenzahlung", "abo"].includes(savedModel))
      setPaymentModel(savedModel);

    const savedEinmaligBetrag = ls("einmaligBetrag");
    if (savedEinmaligBetrag) setEinmaligBetrag(parseFloat(savedEinmaligBetrag));

    const savedEinmaligFaellig = ls("einmaligFaellig");
    if (savedEinmaligFaellig !== null) setEinmaligFaellig(savedEinmaligFaellig);

    const savedGesamtbetrag = ls("gesamtbetrag");
    if (savedGesamtbetrag) setGesamtbetrag(parseFloat(savedGesamtbetrag));

    const savedNumberOfRates = ls("numberOfRates");
    if (savedNumberOfRates) setNumberOfRates(parseInt(savedNumberOfRates));

    const savedFirstDueDate = ls("firstDueDate");
    if (savedFirstDueDate !== null) setFirstDueDate(savedFirstDueDate);

    const savedHasAnzahlung = ls("hasAnzahlung");
    if (savedHasAnzahlung !== null) setHasAnzahlung(savedHasAnzahlung === "true");

    const savedDownPayment = ls("downPayment");
    if (savedDownPayment) setDownPayment(parseFloat(savedDownPayment));

    const savedDownPaymentDate = ls("downPaymentDate");
    if (savedDownPaymentDate !== null) setDownPaymentDate(savedDownPaymentDate);

    const savedRecurringAmount = ls("recurringAmount");
    if (savedRecurringAmount) setRecurringAmount(parseFloat(savedRecurringAmount));

    const savedSubscriptionStart = ls("subscriptionStart");
    if (savedSubscriptionStart !== null) setSubscriptionStart(savedSubscriptionStart);

    const savedPaymentMethod = ls("paymentMethod");
    if (savedPaymentMethod !== null) setPaymentMethod(savedPaymentMethod);

    const savedRegFeeChoice = ls("regFeeChoice");
    if (savedRegFeeChoice !== null) setRegFeeChoice(savedRegFeeChoice);

    const savedRegFeeCustom = ls("regFeeCustom");
    if (savedRegFeeCustom) setRegFeeCustom(parseFloat(savedRegFeeCustom));

    const savedIsUpsell = ls("isUpsell");
    if (savedIsUpsell !== null) setIsUpsell(savedIsUpsell === "true");

    const savedUpsellOrderId = ls("upsellOrderId");
    if (savedUpsellOrderId !== null) setUpsellOrderId(savedUpsellOrderId);

    const savedUpsellProductId = ls("upsellProductId");
    if (savedUpsellProductId !== null) setUpsellProductId(savedUpsellProductId);

    const savedUpsellAmount = ls("upsellAmount");
    if (savedUpsellAmount) setUpsellAmount(parseFloat(savedUpsellAmount));

    const savedUpsellPaid = ls("upsellPaid");
    if (savedUpsellPaid !== null) setUpsellPaid(savedUpsellPaid === "true");

    const savedCoachingUntil = ls("coachingUntil");
    if (savedCoachingUntil !== null) setCoachingUntil(savedCoachingUntil);
  }, [dealId, closers]); // eslint-disable-line react-hooks/exhaustive-deps

  function lsSave(key: string, value: string) {
    localStorage.setItem(`kalaie_edit_${dealId}_${key}`, value);
  }

  function clearDraft() {
    const keys = [
      "closeDate", "closerId", "paymentModel", "einmaligBetrag", "einmaligFaellig",
      "gesamtbetrag", "numberOfRates", "firstDueDate", "hasAnzahlung", "downPayment",
      "downPaymentDate", "recurringAmount", "subscriptionStart", "paymentMethod",
      "regFeeChoice", "regFeeCustom", "isUpsell", "upsellOrderId", "coachingUntil",
      "upsellProductId", "upsellAmount", "upsellPaid",
    ];
    for (const key of keys) localStorage.removeItem(`kalaie_edit_${dealId}_${key}`);
  }

  // ── Derived ──
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

  // ── Computed hidden inputs ──
  const computedPaymentType = (() => {
    if (paymentModel === "abo" && isSubscription) return selectedProductType;
    if (paymentModel === "ratenzahlung") return "installments";
    return "one_time";
  })();

  const computedTotalPrice = (() => {
    if (paymentModel === "abo" && isSubscription) return effectiveRegFee;
    if (paymentModel === "ratenzahlung")
      return gesamtbetrag;
    return einmaligBetrag;
  })();

  const computedOneTimeDueDate = (() => {
    if (paymentModel === "abo") return null;
    if (hasAnzahlung) return downPaymentDate || null;
    if (paymentModel === "einmalig") return einmaligFaellig || null;
    return null;
  })();

  // ── Product change handler ──
  function handleProductChange(productId: string) {
    setSelectedProductId(productId);
    const product = products.find((p) => p.id === productId);
    const pt = product?.product_type ?? "standard";
    setSelectedProductType(pt);

    if (pt === "subscription_monthly" || pt === "subscription_yearly") {
      setPaymentModel("abo");
      lsSave("paymentModel", "abo");
      if (product?.default_recurring_price) {
        setRecurringAmount(product.default_recurring_price);
        lsSave("recurringAmount", String(product.default_recurring_price));
      }
      if ((product?.registration_fee_options ?? []).length > 0) {
        const firstFee = String(product!.registration_fee_options[0]);
        setRegFeeChoice(firstFee);
        lsSave("regFeeChoice", firstFee);
      }
    } else {
      if (paymentModel === "abo") {
        setPaymentModel("einmalig");
        lsSave("paymentModel", "einmalig");
      }
      if (product?.default_price) {
        setEinmaligBetrag(product.default_price);
        lsSave("einmaligBetrag", String(product.default_price));
        setGesamtbetrag(product.default_price);
        lsSave("gesamtbetrag", String(product.default_price));
      }
    }
  }

  const tabs: { value: PaymentModel; label: string; disabled: boolean }[] = [
    { value: "einmalig", label: "Einmalzahlung", disabled: isSubscription },
    { value: "ratenzahlung", label: "Ratenzahlung", disabled: isSubscription },
    { value: "abo", label: "Abo / Wiederkehrend", disabled: !isSubscription },
  ];

  const fe = state?.fieldErrors ?? {};

  return (
    <form action={action} onSubmit={clearDraft} className="space-y-6">
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
              defaultValue={initial.platform_id ?? ""}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">— keine —</option>
              {platforms.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Upsell + Begleitung */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Upsell</Label>
            <label className="flex h-9 items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                name="is_upsell"
                value="on"
                checked={isUpsell}
                onChange={(e) => {
                  setIsUpsell(e.target.checked);
                  lsSave("isUpsell", String(e.target.checked));
                }}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              Dieser Deal hat einen Upsell
            </label>
            {isUpsell && (
              <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-3">
                <div className="space-y-1.5">
                  <Label htmlFor="upsell_product_id">Bisheriges Produkt</Label>
                  <select
                    id="upsell_product_id"
                    name="upsell_product_id"
                    value={upsellProductId}
                    onChange={(e) => {
                      setUpsellProductId(e.target.value);
                      lsSave("upsellProductId", e.target.value);
                    }}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">— keine —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="upsell_amount">Bisher bezahlt (€)</Label>
                  <Input
                    id="upsell_amount"
                    name="upsell_amount"
                    type="number" min="0" step="0.01" placeholder="0,00"
                    value={upsellAmount || ""}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      setUpsellAmount(v);
                      lsSave("upsellAmount", String(v));
                    }}
                  />
                  {upsellAmount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const next = !upsellPaid;
                        setUpsellPaid(next);
                        lsSave("upsellPaid", String(next));
                      }}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all cursor-pointer hover:ring-2 hover:ring-offset-1",
                        upsellPaid
                          ? "bg-emerald-500/15 text-emerald-400 hover:ring-emerald-500/40"
                          : "bg-muted text-muted-foreground hover:ring-border",
                      )}
                    >
                      {upsellPaid ? "✓ Bereits bezahlt" : "Noch offen"}
                    </button>
                  )}
                  {upsellPaid && <input type="hidden" name="upsell_paid" value="on" />}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="upsell_order_id">Alte Bestell-ID</Label>
                  <Input
                    id="upsell_order_id"
                    name="upsell_order_id"
                    placeholder="Bestell-ID des bisherigen Kaufs"
                    value={upsellOrderId}
                    onChange={(e) => {
                      setUpsellOrderId(e.target.value);
                      lsSave("upsellOrderId", e.target.value);
                    }}
                  />
                </div>
                {upsellAmount > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Upsell {fmt(upsellAmount)} {upsellPaid ? "(bezahlt)" : "(offen)"} wird zum Gesamtumsatz addiert.
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="coaching_until">Begleitung läuft bis</Label>
            <Input
              id="coaching_until"
              name="coaching_until"
              type="date"
              value={coachingUntil}
              onChange={(e) => {
                setCoachingUntil(e.target.value);
                lsSave("coachingUntil", e.target.value);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Läuft die Begleitung in ≤ 14 Tagen aus, erscheint der Deal unter „Begleitung".
            </p>
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
              onChange={(e) => {
                setCloseDate(e.target.value);
                lsSave("closeDate", e.target.value);
              }}
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
                onClick={() => {
                  if (!disabled) {
                    setPaymentModel(value);
                    lsSave("paymentModel", value);
                  }
                }}
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
                        onChange={(e) => {
                          const v = parseFloat(e.target.value) || 0;
                          setEinmaligBetrag(v);
                          lsSave("einmaligBetrag", String(v));
                        }}
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
                          onChange={(e) => {
                            setEinmaligFaellig(e.target.value);
                            lsSave("einmaligFaellig", e.target.value);
                          }}
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
                        onChange={(e) => {
                          setPaymentMethod(e.target.value);
                          lsSave("paymentMethod", e.target.value);
                        }}
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
                          onChange={(e) => {
                            setHasAnzahlung(e.target.checked);
                            lsSave("hasAnzahlung", String(e.target.checked));
                          }}
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
                            onChange={(e) => {
                              const v = parseFloat(e.target.value) || 0;
                              setDownPayment(v);
                              lsSave("downPayment", String(v));
                            }}
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
                            onChange={(e) => {
                              setDownPaymentDate(e.target.value);
                              lsSave("downPaymentDate", e.target.value);
                            }}
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
                        onChange={(e) => {
                          const v = parseFloat(e.target.value) || 0;
                          setGesamtbetrag(v);
                          lsSave("gesamtbetrag", String(v));
                        }}
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
                        onChange={(e) => {
                          const v = parseInt(e.target.value) || 0;
                          setNumberOfRates(v);
                          lsSave("numberOfRates", String(v));
                        }}
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
                        onChange={(e) => {
                          setFirstDueDate(e.target.value);
                          lsSave("firstDueDate", e.target.value);
                        }}
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
                        onChange={(e) => {
                          setPaymentMethod(e.target.value);
                          lsSave("paymentMethod", e.target.value);
                        }}
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
                          onChange={(e) => {
                            setHasAnzahlung(e.target.checked);
                            lsSave("hasAnzahlung", String(e.target.checked));
                          }}
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
                            onChange={(e) => {
                              const v = parseFloat(e.target.value) || 0;
                              setDownPayment(v);
                              lsSave("downPayment", String(v));
                            }}
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
                            onChange={(e) => {
                              setDownPaymentDate(e.target.value);
                              lsSave("downPaymentDate", e.target.value);
                            }}
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
                        onChange={(e) => {
                          setRegFeeChoice(e.target.value);
                          lsSave("regFeeChoice", e.target.value);
                          setRegFeePaid(false);
                        }}
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
                          onChange={(e) => {
                            const v = parseFloat(e.target.value) || 0;
                            setRegFeeCustom(v);
                            lsSave("regFeeCustom", String(v));
                          }}
                          className="h-8 text-sm"
                        />
                      )}
                      {effectiveRegFee > 0 && (
                        <button
                          type="button"
                          onClick={() => setRegFeePaid((v) => !v)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all cursor-pointer hover:ring-2 hover:ring-offset-1",
                            regFeePaid
                              ? "bg-emerald-500/15 text-emerald-400 hover:ring-emerald-500/40"
                              : "bg-muted text-muted-foreground hover:ring-border",
                          )}
                        >
                          {regFeePaid ? "✓ Bereits bezahlt" : "Noch nicht bezahlt"}
                        </button>
                      )}
                      {effectiveRegFee > 0 && regFeePaid && (
                        <input type="hidden" name="reg_fee_paid" value="on" />
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
                        onChange={(e) => {
                          const v = parseFloat(e.target.value) || 0;
                          setRecurringAmount(v);
                          lsSave("recurringAmount", String(v));
                        }}
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
                        onChange={(e) => {
                          setSubscriptionStart(e.target.value);
                          lsSave("subscriptionStart", e.target.value);
                        }}
                        className="h-8 text-sm"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-muted-foreground">Zahlart</td>
                    <td className="px-4 py-3">
                      <Input
                        name="payment_method"
                        placeholder="z.B. SEPA-Lastschrift, Kreditkarte"
                        value={paymentMethod}
                        onChange={(e) => {
                          setPaymentMethod(e.target.value);
                          lsSave("paymentMethod", e.target.value);
                        }}
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
              onChange={(e) => {
                setCloserId(e.target.value);
                lsSave("closerId", e.target.value);
              }}
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
        <div className="rounded-lg border border-red-900/40 bg-red-900/10 px-4 py-3 space-y-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer text-amber-400">
            <input
              type="checkbox"
              name="chargeback"
              value="on"
              defaultChecked={initial.chargeback}
              className="h-4 w-4 rounded border-amber-800 accent-amber-700"
            />
            Rückbuchung — Zahlung wurde zurückgebucht
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer text-red-400">
            <input
              type="checkbox"
              name="storniert"
              value="on"
              defaultChecked={initial.storniert}
              className="h-4 w-4 rounded border-red-800 accent-red-700"
            />
            Storniert — Vertrag wurde storniert / gekündigt
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
          defaultValue={initial.notes ?? ""}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Wird gespeichert…" : "Änderungen speichern"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            clearDraft();
            history.back();
          }}
        >
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

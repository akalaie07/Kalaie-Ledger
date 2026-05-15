"use client";

import { useEffect, useState, useActionState } from "react";

import type { LookupAction, LookupActionState } from "@/lib/actions/stammdaten";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { DeleteButton, FieldError, StatusBadge, ToggleButton } from "./shared";

export type ProductType = "standard" | "subscription_monthly" | "subscription_yearly";

export type Product = {
  id: string;
  name: string;
  default_price: number | null;
  active: boolean;
  product_type: ProductType;
  registration_fee_options: number[];
  default_recurring_price: number | null;
};

const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  standard: "Einmalkauf",
  subscription_monthly: "Abo — Monatlich",
  subscription_yearly: "Abo — Jährlich",
};

const PRODUCT_TYPE_COLORS: Record<ProductType, string> = {
  standard: "bg-blue-500/15 text-blue-400",
  subscription_monthly: "bg-violet-500/15 text-violet-400",
  subscription_yearly: "bg-amber-500/15 text-amber-400",
};

function ProductTypeBadge({ type }: { type: ProductType }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", PRODUCT_TYPE_COLORS[type])}>
      {PRODUCT_TYPE_LABELS[type]}
    </span>
  );
}

function ProductForm({
  action,
  itemId,
  defaultName = "",
  defaultPrice = "",
  defaultProductType = "standard",
  defaultRegistrationFeeOptions = [],
  defaultRecurringPrice = "",
  onDone,
}: {
  action: LookupAction;
  itemId?: string;
  defaultName?: string;
  defaultPrice?: string;
  defaultProductType?: ProductType;
  defaultRegistrationFeeOptions?: number[];
  defaultRecurringPrice?: string;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<LookupActionState, FormData>(
    action,
    null,
  );
  const [productType, setProductType] = useState<ProductType>(defaultProductType);
  // Controlled inputs so they survive React 19 form reset after server action error
  const [name, setName] = useState(defaultName);
  const [price, setPrice] = useState(defaultPrice);
  const [recurringPrice, setRecurringPrice] = useState(defaultRecurringPrice);
  const [regFeeOptions, setRegFeeOptions] = useState(defaultRegistrationFeeOptions.join(", "));
  const isSubscription = productType === "subscription_monthly" || productType === "subscription_yearly";

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state?.ok]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
      {itemId && <input type="hidden" name="id" value={itemId} />}
      {state?.error && <p className="text-xs text-destructive">{state.error}</p>}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor={`pr-name-${itemId ?? "new"}`}>Name</Label>
          <Input
            id={`pr-name-${itemId ?? "new"}`}
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            aria-invalid={!!state?.fieldErrors?.name}
          />
          <FieldError errors={state?.fieldErrors?.name} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`pr-price-${itemId ?? "new"}`}>Standardpreis (€)</Label>
          <Input
            id={`pr-price-${itemId ?? "new"}`}
            name="default_price"
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="optional"
            aria-invalid={!!state?.fieldErrors?.default_price}
          />
          <FieldError errors={state?.fieldErrors?.default_price} />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`pr-type-${itemId ?? "new"}`}>Produktart</Label>
        <select
          id={`pr-type-${itemId ?? "new"}`}
          name="product_type"
          value={productType}
          onChange={(e) => setProductType(e.target.value as ProductType)}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="standard">Einmalkauf</option>
          <option value="subscription_monthly">Abo — Monatlich</option>
          <option value="subscription_yearly">Abo — Jährlich</option>
        </select>
        <FieldError errors={state?.fieldErrors?.product_type} />
      </div>

      {/* Abo-spezifische Felder */}
      {isSubscription && (
        <div className="rounded-md border border-violet-500/20 bg-violet-500/5 p-3 space-y-3">
          <p className="text-xs font-medium text-violet-400">Abo-Preise</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor={`pr-recurring-${itemId ?? "new"}`}>
                {productType === "subscription_monthly" ? "Monatlicher Betrag (€)" : "Jährlicher Betrag (€)"}
              </Label>
              <Input
                id={`pr-recurring-${itemId ?? "new"}`}
                name="default_recurring_price"
                type="number"
                min="0"
                step="0.01"
                value={recurringPrice}
                onChange={(e) => setRecurringPrice(e.target.value)}
                placeholder="z.B. 30"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`pr-regfees-${itemId ?? "new"}`}>
                Anmeldegebühr-Optionen (€)
              </Label>
              <Input
                id={`pr-regfees-${itemId ?? "new"}`}
                name="registration_fee_options_raw"
                value={regFeeOptions}
                onChange={(e) => setRegFeeOptions(e.target.value)}
                placeholder="z.B. 129, 1"
              />
              <p className="text-xs text-muted-foreground">Komma-getrennte Preise</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Speichern…" : "Speichern"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

function formatPrice(price: number | null) {
  if (price == null) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(price);
}

export function ProductsSection({
  items,
  createAction,
  updateAction,
  toggleAction,
  deleteAction,
}: {
  items: Product[];
  createAction: LookupAction;
  updateAction: LookupAction;
  toggleAction: LookupAction;
  deleteAction: (id: string) => Promise<{ error?: string }>;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Produkte</h2>
        {!showCreate && (
          <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
            + Neu
          </Button>
        )}
      </div>

      {showCreate && (
        <ProductForm action={createAction} onDone={() => setShowCreate(false)} />
      )}

      <div className="divide-y divide-border rounded-lg border border-border">
        {items.length === 0 && (
          <p className="px-4 py-3 text-sm text-muted-foreground">
            Noch keine Produkte angelegt.
          </p>
        )}
        {items.map((item) => (
          <div key={item.id} className="px-4 py-3 space-y-2">
            {editingId === item.id ? (
              <ProductForm
                action={updateAction}
                itemId={item.id}
                defaultName={item.name}
                defaultPrice={item.default_price != null ? String(item.default_price) : ""}
                defaultProductType={item.product_type}
                defaultRegistrationFeeOptions={item.registration_fee_options ?? []}
                defaultRecurringPrice={item.default_recurring_price != null ? String(item.default_recurring_price) : ""}
                onDone={() => setEditingId(null)}
              />
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0 flex-wrap">
                  <span className="truncate text-sm font-medium">{item.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatPrice(item.default_price)}
                  </span>
                  {item.default_recurring_price != null && (
                    <span className="text-xs text-violet-400 tabular-nums">
                      + {formatPrice(item.default_recurring_price)}/
                      {item.product_type === "subscription_monthly" ? "Mo." : "Jahr"}
                    </span>
                  )}
                  {(item.registration_fee_options ?? []).length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      Gebühr: {item.registration_fee_options.map(formatPrice).join(" | ")}
                    </span>
                  )}
                  <ProductTypeBadge type={item.product_type} />
                  <StatusBadge active={item.active} />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => setEditingId(item.id)}>
                    Bearbeiten
                  </Button>
                  <ToggleButton id={item.id} active={item.active} action={toggleAction} />
                  <DeleteButton id={item.id} onDelete={deleteAction} />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

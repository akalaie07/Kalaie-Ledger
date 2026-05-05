"use client";

import { useEffect, useState, useActionState } from "react";

import type { LookupAction, LookupActionState } from "@/lib/actions/stammdaten";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, StatusBadge, ToggleButton } from "./shared";

export type Product = {
  id: string;
  name: string;
  default_price: number | null;
  active: boolean;
};

function ProductForm({
  action,
  itemId,
  defaultName = "",
  defaultPrice = "",
  onDone,
}: {
  action: LookupAction;
  itemId?: string;
  defaultName?: string;
  defaultPrice?: string;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<LookupActionState, FormData>(
    action,
    null,
  );

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
            defaultValue={defaultName}
            autoFocus
            aria-invalid={!!state?.fieldErrors?.name}
          />
          <FieldError errors={state?.fieldErrors?.name} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`pr-price-${itemId ?? "new"}`}>
            Standardpreis (€)
          </Label>
          <Input
            id={`pr-price-${itemId ?? "new"}`}
            name="default_price"
            type="number"
            min="0"
            step="0.01"
            defaultValue={defaultPrice}
            placeholder="optional"
            aria-invalid={!!state?.fieldErrors?.default_price}
          />
          <FieldError errors={state?.fieldErrors?.default_price} />
        </div>
      </div>
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
}: {
  items: Product[];
  createAction: LookupAction;
  updateAction: LookupAction;
  toggleAction: LookupAction;
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
                defaultPrice={
                  item.default_price != null ? String(item.default_price) : ""
                }
                onDone={() => setEditingId(null)}
              />
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="truncate text-sm font-medium">{item.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatPrice(item.default_price)}
                  </span>
                  <StatusBadge active={item.active} />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingId(item.id)}
                  >
                    Bearbeiten
                  </Button>
                  <ToggleButton id={item.id} active={item.active} action={toggleAction} />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

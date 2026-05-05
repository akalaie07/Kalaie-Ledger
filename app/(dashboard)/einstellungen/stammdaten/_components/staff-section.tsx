"use client";

import { useEffect, useState, useActionState } from "react";

import type { LookupAction, LookupActionState } from "@/lib/actions/stammdaten";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, StatusBadge, ToggleButton } from "./shared";

export type StaffItem = {
  id: string;
  name: string;
  commission_rate: number;
  active: boolean;
  profile_id: string | null;
};

export type ProfileOpt = {
  id: string;
  full_name: string | null;
  email: string;
};

function StaffForm({
  action,
  itemId,
  defaultName = "",
  defaultRatePct = "",
  defaultProfileId = "",
  profiles,
  onDone,
}: {
  action: LookupAction;
  itemId?: string;
  defaultName?: string;
  defaultRatePct?: string;
  defaultProfileId?: string;
  profiles: ProfileOpt[];
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
          <Label htmlFor={`sf-name-${itemId ?? "new"}`}>Name</Label>
          <Input
            id={`sf-name-${itemId ?? "new"}`}
            name="name"
            defaultValue={defaultName}
            autoFocus
            aria-invalid={!!state?.fieldErrors?.name}
          />
          <FieldError errors={state?.fieldErrors?.name} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`sf-rate-${itemId ?? "new"}`}>Provision (%)</Label>
          <Input
            id={`sf-rate-${itemId ?? "new"}`}
            name="commission_rate_pct"
            type="number"
            min="0"
            max="100"
            step="0.01"
            defaultValue={defaultRatePct}
            aria-invalid={!!state?.fieldErrors?.commission_rate_pct}
          />
          <FieldError errors={state?.fieldErrors?.commission_rate_pct} />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`sf-profile-${itemId ?? "new"}`}>
          Verknüpfter Account{" "}
          <span className="text-muted-foreground">(optional)</span>
        </Label>
        <select
          id={`sf-profile-${itemId ?? "new"}`}
          name="profile_id"
          defaultValue={defaultProfileId}
          className="border-input bg-background text-foreground flex h-8 w-full rounded-lg border px-3 py-1 text-sm outline-none transition-shadow focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:border-input"
        >
          <option value="">— Kein Account —</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name ? `${p.full_name} (${p.email})` : p.email}
            </option>
          ))}
        </select>
        <FieldError errors={state?.fieldErrors?.profile_id} />
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

function formatRate(rate: number) {
  return `${Number((rate * 100).toFixed(4))} %`;
}

function toRatePct(rate: number) {
  return String(Number((rate * 100).toFixed(4)));
}

export function StaffSection({
  title,
  items,
  profiles,
  createAction,
  updateAction,
  toggleAction,
}: {
  title: string;
  items: StaffItem[];
  profiles: ProfileOpt[];
  createAction: LookupAction;
  updateAction: LookupAction;
  toggleAction: LookupAction;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        {!showCreate && (
          <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
            + Neu
          </Button>
        )}
      </div>

      {showCreate && (
        <StaffForm
          action={createAction}
          profiles={profiles}
          onDone={() => setShowCreate(false)}
        />
      )}

      <div className="divide-y divide-border rounded-lg border border-border">
        {items.length === 0 && (
          <p className="px-4 py-3 text-sm text-muted-foreground">
            Noch keine Einträge angelegt.
          </p>
        )}
        {items.map((item) => (
          <div key={item.id} className="px-4 py-3 space-y-2">
            {editingId === item.id ? (
              <StaffForm
                action={updateAction}
                itemId={item.id}
                defaultName={item.name}
                defaultRatePct={toRatePct(item.commission_rate)}
                defaultProfileId={item.profile_id ?? ""}
                profiles={profiles}
                onDone={() => setEditingId(null)}
              />
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="truncate text-sm font-medium">{item.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatRate(item.commission_rate)}
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

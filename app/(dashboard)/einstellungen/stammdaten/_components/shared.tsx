"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

import type { LookupAction } from "@/lib/actions/stammdaten";
import { Button } from "@/components/ui/button";

export function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs ${
        active ? "text-emerald-500" : "text-muted-foreground"
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${
          active ? "bg-emerald-500" : "bg-muted-foreground/60"
        }`}
      />
      {active ? "Aktiv" : "Inaktiv"}
    </span>
  );
}

export function ToggleButton({
  id,
  active,
  action,
}: {
  id: string;
  active: boolean;
  action: LookupAction;
}) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      fd.set("active", String(active));
      const result = await action(null, fd);
      if (result && !result.ok) toast.error(result.error ?? "Unbekannter Fehler.");
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      disabled={pending}
      className={active ? "text-muted-foreground hover:text-destructive" : "text-emerald-500"}
    >
      {pending ? "…" : active ? "Deaktivieren" : "Aktivieren"}
    </Button>
  );
}

export function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="text-xs text-destructive">{errors[0]}</p>;
}

export function DeleteButton({
  id,
  onDelete,
}: {
  id: string;
  onDelete: (id: string) => Promise<{ error?: string }>;
}) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await onDelete(id);
      if (result?.error) {
        setError(result.error);
        setConfirm(false);
        toast.error(result.error);
      }
    });
  }

  if (confirm) {
    return (
      <div className="flex items-center gap-1">
        {error && <p className="text-xs text-destructive mr-1">{error}</p>}
        <Button
          size="sm"
          variant="destructive"
          onClick={handleDelete}
          disabled={pending}
          className="h-7 px-2 text-xs"
        >
          {pending ? "…" : "Löschen"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => { setConfirm(false); setError(null); }}
          className="h-7 px-2 text-xs"
        >
          Abbrechen
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => setConfirm(true)}
      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
      title="Löschen"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}

"use client";

import { useTransition } from "react";
import { toast } from "sonner";

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

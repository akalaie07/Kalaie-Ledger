"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";

import { deleteDeal } from "@/lib/actions/deals";

export function DeleteDealButton({ dealId }: { dealId: string }) {
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm("Deal wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.")) return;
    startTransition(async () => {
      await deleteDeal(dealId);
    });
  }

  return (
    <button
      onClick={handleDelete}
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
    >
      {pending ? (
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent" />
      ) : (
        <Trash2 className="h-3.5 w-3.5" />
      )}
      Deal löschen
    </button>
  );
}

"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { deleteDeal } from "@/lib/actions/deals";

export function DealRowActions({ dealId }: { dealId: string }) {
  const [pending, startTransition] = useTransition();

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    if (!confirm("Deal wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.")) return;
    startTransition(async () => {
      await deleteDeal(dealId);
    });
  }

  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <Link
        href={`/deals/${dealId}/edit`}
        className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        title="Bearbeiten"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Link>
      <button
        onClick={handleDelete}
        disabled={pending}
        className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
        title="Löschen"
      >
        {pending
          ? <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent" />
          : <Trash2 className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

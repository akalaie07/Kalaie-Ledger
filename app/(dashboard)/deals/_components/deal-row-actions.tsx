"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Pencil, Trash2, TriangleAlert, Gavel } from "lucide-react";

import { deleteDeal, setDealEscalation } from "@/lib/actions/deals";
import { cn } from "@/lib/utils";

export function DealRowActions({
  dealId,
  mahnungRequired,
  inkassoRequired,
}: {
  dealId: string;
  mahnungRequired: boolean;
  inkassoRequired: boolean;
}) {
  const [deletePending, startDelete] = useTransition();
  const [escalatePending, startEscalate] = useTransition();

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    if (!confirm("Deal wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.")) return;
    startDelete(async () => { await deleteDeal(dealId); });
  }

  function handleEscalate(e: React.MouseEvent) {
    e.preventDefault();
    if (inkassoRequired) return;
    if (mahnungRequired) {
      // Dreieck wurde zu Gavel → Klick = Inkasso setzen, Mahnung aufheben
      if (!confirm("Deal zu Inkasso eskalieren?")) return;
      startEscalate(async () => { await setDealEscalation(dealId, false, true); });
    } else {
      // Dreieck → Mahnung setzen (kein Confirm nötig)
      startEscalate(async () => { await setDealEscalation(dealId, true, false); });
    }
  }

  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      {/* Eskalations-Button: Dreieck (→ Mahnung) oder Gavel (→ Inkasso), verschwindet wenn Inkasso aktiv */}
      {!inkassoRequired && (
        <button
          onClick={handleEscalate}
          disabled={escalatePending}
          title={mahnungRequired ? "Zu Inkasso eskalieren" : "In Mahnung setzen"}
          className={cn(
            "rounded p-1 transition-colors disabled:opacity-50",
            mahnungRequired
              ? "text-rose-400 hover:bg-rose-500/10"
              : "text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10",
          )}
        >
          {escalatePending
            ? <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent" />
            : mahnungRequired
              ? <Gavel className="h-3.5 w-3.5" />
              : <TriangleAlert className="h-3.5 w-3.5" />}
        </button>
      )}

      <Link
        href={`/deals/${dealId}/edit`}
        className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        title="Bearbeiten"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Link>

      <button
        onClick={handleDelete}
        disabled={deletePending}
        className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
        title="Löschen"
      >
        {deletePending
          ? <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent" />
          : <Trash2 className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

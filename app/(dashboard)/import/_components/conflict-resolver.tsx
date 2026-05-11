"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle,
  X,
  UserCheck,
  PlusCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  resolveConflictAssign,
  resolveConflictCreateDeal,
  resolveConflictSkip,
  type ImportConflict,
} from "@/lib/actions/import-conflicts";

// =============================================================================
// Typen
// =============================================================================

type ConflictStatus = "pending" | "resolved" | "skipped" | "error";

type ConflictState = {
  conflict: ImportConflict;
  localStatus: ConflictStatus;
  errorMsg: string | null;
};

// =============================================================================
// Einzelner Konflikt-Card
// =============================================================================

function ConflictCard({
  state,
  onUpdate,
}: {
  state: ConflictState;
  onUpdate: (id: string, status: ConflictStatus, error: string | null) => void;
}) {
  const { conflict, localStatus, errorMsg } = state;
  const n = conflict.normalized;
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const fmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: n.currency || "EUR" });

  function handleAssign(dealId: string) {
    startTransition(async () => {
      const res = await resolveConflictAssign(conflict.id, dealId);
      onUpdate(conflict.id, res.error ? "error" : "resolved", res.error);
    });
  }

  function handleCreateNew() {
    startTransition(async () => {
      const res = await resolveConflictCreateDeal(conflict.id);
      onUpdate(conflict.id, res.error ? "error" : "resolved", res.error);
    });
  }

  function handleSkip() {
    startTransition(async () => {
      const res = await resolveConflictSkip(conflict.id);
      onUpdate(conflict.id, res.error ? "error" : "skipped", res.error);
    });
  }

  // Bereits gelöst / übersprungen
  if (localStatus === "resolved") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm">
        <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
        <span className="text-emerald-400">
          {n.customerName} — zugeordnet ✓
        </span>
      </div>
    );
  }

  if (localStatus === "skipped") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-muted bg-muted/10 px-3 py-2 text-sm text-muted-foreground">
        <X className="h-4 w-4 shrink-0" />
        {n.customerName} — übersprungen
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-3 py-2.5">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{n.customerName}</p>
            <p className="text-xs text-muted-foreground">
              {n.externalOrderId !== n.customerName ? n.externalOrderId : "Keine Bestell-ID"}{" "}
              · {n.amount > 0 ? fmt.format(n.amount) : "—"}{" "}
              · {n.eventDate}
            </p>
            <p className="text-xs text-amber-400/70 mt-0.5">{conflict.reason}</p>
          </div>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-muted-foreground hover:text-foreground shrink-0"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Details */}
      {expanded && (
        <div className="border-t border-amber-500/20 px-3 py-2 text-xs text-muted-foreground space-y-1">
          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
            {n.productRawName && <span>Produkt: {n.productRawName}</span>}
            {n.platformRawName && <span>Plattform: {n.platformRawName}</span>}
            {n.planType !== "unknown" && <span>Plan: {n.planType}</span>}
            {n.installmentSequence && <span>Rate {n.installmentSequence}</span>}
            <span>Quelle: {n.source}</span>
          </div>
        </div>
      )}

      {/* Fehler-Meldung */}
      {errorMsg && (
        <div className="border-t border-rose-500/20 px-3 py-1.5 text-xs text-rose-400">
          Fehler: {errorMsg}
        </div>
      )}

      {/* Fuzzy-Vorschläge */}
      {conflict.suggestedDeals.length > 0 && (
        <div className="border-t border-amber-500/20 px-3 py-2 space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Mögliche Zuordnungen:</p>
          {conflict.suggestedDeals.map((match) => (
            <div
              key={match.dealId}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-background/40 px-2 py-1.5"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{match.dealCustomerName}</p>
                <p className="text-[10px] text-muted-foreground">
                  {match.reasons.join(" · ")} · {Math.round(match.score * 100)}% Match
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-xs shrink-0"
                disabled={pending}
                onClick={() => handleAssign(match.dealId)}
              >
                <UserCheck className="h-3 w-3 mr-1" />
                Zuordnen
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Aktions-Buttons */}
      <div className="border-t border-amber-500/20 px-3 py-2 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={pending}
          onClick={handleCreateNew}
        >
          <PlusCircle className="h-3 w-3 mr-1" />
          Neu anlegen
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-muted-foreground"
          disabled={pending}
          onClick={handleSkip}
        >
          Überspringen
        </Button>
        {pending && <span className="text-xs text-muted-foreground self-center">Wird verarbeitet…</span>}
      </div>
    </div>
  );
}

// =============================================================================
// ConflictResolver — Haupt-Komponente
// =============================================================================

export function ConflictResolver({ conflicts }: { conflicts: ImportConflict[] }) {
  const [states, setStates] = useState<ConflictState[]>(
    conflicts.map((c) => ({ conflict: c, localStatus: "pending" as ConflictStatus, errorMsg: null })),
  );

  function handleUpdate(id: string, status: ConflictStatus, error: string | null) {
    setStates((prev) =>
      prev.map((s) => (s.conflict.id === id ? { ...s, localStatus: status, errorMsg: error } : s)),
    );
  }

  const pending = states.filter((s) => s.localStatus === "pending").length;
  const resolved = states.filter((s) => s.localStatus === "resolved").length;
  const skipped = states.filter((s) => s.localStatus === "skipped").length;

  if (states.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Offene Konflikte</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {pending > 0 ? `${pending} müssen noch geklärt werden` : "Alle Konflikte geklärt"}{" "}
            {resolved > 0 && `· ${resolved} zugeordnet`}
            {skipped > 0 && `· ${skipped} übersprungen`}
          </p>
        </div>
        {pending === 0 && (
          <span className="flex items-center gap-1 text-xs text-emerald-400">
            <CheckCircle className="h-3.5 w-3.5" />
            Fertig
          </span>
        )}
      </div>

      {/* Konflikt-Karten */}
      <div className="space-y-2">
        {states.map((s) => (
          <ConflictCard key={s.conflict.id} state={s} onUpdate={handleUpdate} />
        ))}
      </div>
    </div>
  );
}

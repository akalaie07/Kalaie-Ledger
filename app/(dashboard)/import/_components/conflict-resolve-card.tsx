"use client";

/**
 * ConflictResolveCard — Interaktive Karte zum Auflösen eines Import-Konflikts.
 *
 * Drei Aktionen:
 *  • "Zuordnen" — Konflikt einem vorgeschlagenen oder gesuchten Deal zuordnen
 *  • "Neuen Deal anlegen" — Deal direkt aus den Import-Daten erstellen
 *  • "Überspringen" — Konflikt ohne Aktion schließen
 */

import { useState, useTransition } from "react";
import {
  AlertCircle,
  Check,
  ExternalLink,
  Plus,
  Search,
  SkipForward,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import Link from "next/link";

import {
  resolveConflictAssign,
  resolveConflictCreateDeal,
  resolveConflictSkip,
  searchDealsForAssignment,
} from "@/lib/actions/import-conflicts";
import { cn } from "@/lib/utils";

// =============================================================================
// Types
// =============================================================================

export interface ConflictResolveCardProps {
  id: string;
  customerName: string;
  orderId: string;
  amount: number;
  eventDate: string;
  reason: string;
  action: string;
  source: string;
  suggestedDeals: Array<{ id: string; customer_name: string }>;
}

type SearchResult = {
  id: string;
  customer_name: string;
  order_id: string | null;
  total_price: number;
};

// =============================================================================
// Component
// =============================================================================

export function ConflictResolveCard(props: ConflictResolveCardProps) {
  const [resolved, setResolved] = useState(false);
  const [resolvedWith, setResolvedWith] = useState<
    "assigned" | "created" | "skipped" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, startSearch] = useTransition();

  const fmt = new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  });

  // ── Actions ────────────────────────────────────────────────────────────────

  function assign(dealId: string) {
    setError(null);
    startTransition(async () => {
      const result = await resolveConflictAssign(props.id, dealId);
      if (result.error) setError(result.error);
      else {
        setResolved(true);
        setResolvedWith("assigned");
      }
    });
  }

  function createDeal() {
    setError(null);
    startTransition(async () => {
      const result = await resolveConflictCreateDeal(props.id);
      if (result.error) setError(result.error);
      else {
        setResolved(true);
        setResolvedWith("created");
      }
    });
  }

  function skip() {
    setError(null);
    startTransition(async () => {
      const result = await resolveConflictSkip(props.id);
      if (result.error) setError(result.error);
      else {
        setResolved(true);
        setResolvedWith("skipped");
      }
    });
  }

  function handleSearch(q: string) {
    setSearchQuery(q);
    if (q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    startSearch(async () => {
      const results = await searchDealsForAssignment(q);
      setSearchResults(results);
    });
  }

  // ── Resolved state ────────────────────────────────────────────────────────

  if (resolved) {
    return (
      <div
        className={cn(
          "rounded-lg border p-4 flex items-center gap-3 transition-all",
          resolvedWith === "skipped"
            ? "border-border bg-muted/10 opacity-60"
            : "border-emerald-500/30 bg-emerald-500/5",
        )}
      >
        {resolvedWith === "skipped" ? (
          <SkipForward className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <Check className="h-4 w-4 text-emerald-400 shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{props.customerName}</p>
          <p className="text-xs text-muted-foreground">
            {resolvedWith === "assigned" && "Dem Deal zugeordnet ✓"}
            {resolvedWith === "created" && "Neuer Deal angelegt ✓"}
            {resolvedWith === "skipped" && "Übersprungen"}
          </p>
        </div>
      </div>
    );
  }

  // ── Pending overlay ───────────────────────────────────────────────────────

  return (
    <div
      className={cn(
        "rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3 transition-opacity",
        pending && "opacity-60 pointer-events-none",
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="font-medium">{props.customerName}</p>
            <p className="text-xs text-muted-foreground font-mono">
              {props.orderId}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          {props.amount > 0 && (
            <p className="text-sm font-semibold tabular-nums">
              {fmt.format(props.amount)}
            </p>
          )}
          {props.eventDate && (
            <p className="text-xs text-muted-foreground">
              {format(new Date(props.eventDate), "dd.MM.yyyy", { locale: de })}
            </p>
          )}
        </div>
      </div>

      {/* Reason */}
      <div className="rounded-md bg-muted/30 px-3 py-2">
        <p className="text-xs font-medium text-amber-400 mb-0.5">Grund</p>
        <p className="text-xs text-muted-foreground">
          {props.reason || props.action}
        </p>
        {props.source && (
          <p className="text-[10px] text-muted-foreground/60 mt-1 capitalize">
            Quelle: {props.source}
          </p>
        )}
      </div>

      {/* Suggested deals */}
      {props.suggestedDeals.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Mögliche Treffer — Dem Deal zuordnen:
          </p>
          <div className="flex flex-wrap gap-2">
            {props.suggestedDeals.map((deal) => (
              <div key={deal.id} className="flex items-stretch">
                <Link
                  href={`/deals/${deal.id}`}
                  target="_blank"
                  className="inline-flex items-center gap-1 rounded-l-md border border-border bg-card px-2.5 py-1 text-xs hover:border-foreground/30 hover:bg-muted/30 transition-colors"
                >
                  {deal.customer_name}
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </Link>
                <button
                  onClick={() => assign(deal.id)}
                  disabled={pending}
                  className={cn(
                    "inline-flex items-center rounded-r-md border border-l-0 px-2.5 py-1 text-xs font-medium transition-colors",
                    "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
                    "hover:bg-emerald-500/20 disabled:opacity-50",
                  )}
                >
                  Zuordnen
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search for other deal */}
      <div className="space-y-2">
        {showSearch ? (
          <>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  placeholder="Kundennamen suchen…"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  autoFocus
                  className={cn(
                    "w-full rounded-md border border-input bg-transparent pl-8 pr-3 py-1.5 text-sm",
                    "focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground",
                  )}
                />
              </div>
              <button
                onClick={() => {
                  setShowSearch(false);
                  setSearchQuery("");
                  setSearchResults([]);
                }}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {searching && (
              <p className="text-xs text-muted-foreground">Suche…</p>
            )}

            {!searching && searchResults.length > 0 && (
              <div className="rounded-md border border-border overflow-hidden divide-y divide-border">
                {searchResults.map((deal) => (
                  <div
                    key={deal.id}
                    className="flex items-center justify-between px-3 py-2 hover:bg-muted/20 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {deal.customer_name}
                      </p>
                      {deal.order_id && (
                        <p className="text-xs text-muted-foreground font-mono">
                          {deal.order_id}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {fmt.format(deal.total_price)}
                      </span>
                      <button
                        onClick={() => assign(deal.id)}
                        disabled={pending}
                        className={cn(
                          "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                          "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
                          "hover:bg-emerald-500/20 disabled:opacity-50",
                        )}
                      >
                        Zuordnen
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!searching &&
              searchQuery.trim().length >= 2 &&
              searchResults.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Kein Deal gefunden für &ldquo;{searchQuery}&rdquo;.
                </p>
              )}
          </>
        ) : (
          <button
            onClick={() => setShowSearch(true)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Search className="h-3.5 w-3.5" />
            Anderen Deal suchen
          </button>
        )}
      </div>

      {/* Error */}
      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Action buttons */}
      <div className="flex gap-2 pt-1 flex-wrap border-t border-amber-500/20">
        <button
          onClick={createDeal}
          disabled={pending}
          className={cn(
            "mt-3 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
            "border-blue-500/40 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 disabled:opacity-50",
          )}
        >
          <Plus className="h-3.5 w-3.5" />
          Neuen Deal anlegen
        </button>
        <button
          onClick={skip}
          disabled={pending}
          className={cn(
            "mt-3 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
            "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground disabled:opacity-50",
          )}
        >
          <SkipForward className="h-3.5 w-3.5" />
          Überspringen
        </button>
      </div>
    </div>
  );
}

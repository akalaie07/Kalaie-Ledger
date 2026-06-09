"use client";

import { useTransition } from "react";
import { CheckCircle, PlusCircle, Sparkles } from "lucide-react";

import { createProductForImport } from "@/lib/actions/import-aliases";
import type { ResolveResult, EntityCandidate } from "@/lib/import/resolve";
import { Button } from "@/components/ui/button";

const SELECT_CLASS =
  "flex h-8 min-w-[170px] rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * Zeigt Produktnamen aus dem Export, die (noch) keinem internen Produkt
 * eindeutig zugeordnet sind, und lässt den Admin sie bestätigen. Die Auswahl
 * wird beim Import als Alias gespeichert → künftige Importe lösen automatisch auf.
 */
export function ProductMappingStep({
  candidates,
  results,
  mappings,
  onMap,
  onCreated,
}: {
  candidates: EntityCandidate[];
  results: ResolveResult[];
  mappings: Map<string, string>;
  onMap: (rawValue: string, targetId: string) => void;
  onCreated: (product: EntityCandidate) => void;
}) {
  const needsAttention = results.filter((r) => r.status !== "matched");
  if (needsAttention.length === 0) return null;

  const openCount = needsAttention.filter((r) => !mappings.get(r.rawValue)).length;

  return (
    <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-400" />
        <h3 className="text-sm font-semibold">Produkte zuordnen</h3>
        <span className="text-xs text-muted-foreground">
          ({needsAttention.length}{openCount > 0 ? `, ${openCount} offen` : ""})
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Diese Produktnamen aus dem Export sind keinem deiner Produkte eindeutig zugeordnet.
        Ordne sie einmal zu (oder lege ein neues Produkt an) — beim nächsten Import
        geschieht das automatisch.
      </p>
      <div className="space-y-2">
        {needsAttention.map((r) => (
          <MappingRow
            key={r.rawValue}
            result={r}
            candidates={candidates}
            value={mappings.get(r.rawValue) ?? ""}
            onMap={(targetId) => onMap(r.rawValue, targetId)}
            onCreated={onCreated}
          />
        ))}
      </div>
    </div>
  );
}

function MappingRow({
  result,
  candidates,
  value,
  onMap,
  onCreated,
}: {
  result: ResolveResult;
  candidates: EntityCandidate[];
  value: string;
  onMap: (targetId: string) => void;
  onCreated: (product: EntityCandidate) => void;
}) {
  const [creating, startCreate] = useTransition();

  function handleCreate() {
    startCreate(async () => {
      const product = await createProductForImport(result.rawValue);
      onCreated(product);
      onMap(product.id);
    });
  }

  return (
    <div className="flex items-center gap-2 flex-wrap rounded-md border border-border bg-card px-3 py-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{result.rawValue}</p>
        {result.suggestion ? (
          <p className="text-[11px] text-muted-foreground">
            Vorschlag: <span className="text-violet-300">{result.suggestion.name}</span>{" "}
            ({Math.round(result.suggestion.confidence * 100)}%)
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">Kein Vorschlag — bitte wählen oder neu anlegen.</p>
        )}
      </div>
      <select
        value={value}
        onChange={(e) => onMap(e.target.value)}
        className={SELECT_CLASS}
        aria-label={`Produkt für ${result.rawValue}`}
      >
        <option value="">— nicht zuordnen —</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <Button type="button" variant="outline" size="sm" disabled={creating} onClick={handleCreate}>
        <PlusCircle className="h-3.5 w-3.5 mr-1" />
        {creating ? "…" : "Neu"}
      </Button>
      {value && <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />}
    </div>
  );
}

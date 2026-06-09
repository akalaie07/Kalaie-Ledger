// =============================================================================
// Stammdaten-Auflösung für den Smart Import
//
// Ordnet einen Rohwert aus einem Plattform-Export (z. B. Produktname
// "Die Maestro Sales Masterclass - Gold") einem internen Stammdaten-Eintrag zu.
// Reihenfolge: gemerkter Alias → exakter Name → bester Fuzzy-Vorschlag.
//
// Reine Logik, kein DB-Zugriff — testbar und im Server-Action wiederverwendbar.
// =============================================================================

import { normName, jaroWinkler } from "./fuzzy";

export type EntityCandidate = { id: string; name: string };
export type EntityAlias = { rawValue: string; targetId: string };

export type ResolveStatus = "matched" | "suggested" | "unknown";

export type ResolveResult = {
  rawValue: string;
  status: ResolveStatus;
  /** Gesetzt bei status "matched" (über Alias oder exakten Namen). */
  targetId: string | null;
  /** true, wenn der Treffer über einen gemerkten Alias kam. */
  viaAlias: boolean;
  /** Bester Fuzzy-Vorschlag (auch bei "unknown" als Hinweis, wenn Score moderat). */
  suggestion: { id: string; name: string; confidence: number } | null;
};

// Ab diesem Score gilt ein Fuzzy-Treffer als (unbestätigter) Vorschlag.
const SUGGEST_THRESHOLD = 0.78;
// Darunter wird kein Vorschlag mehr angezeigt.
const HINT_THRESHOLD = 0.5;

export function resolveEntity(
  rawValue: string,
  candidates: EntityCandidate[],
  aliases: EntityAlias[],
): ResolveResult {
  const raw = rawValue.trim();
  const norm = normName(raw);

  // 1. Gemerkter Alias (nur gültig, wenn das Ziel noch existiert)
  const alias = aliases.find((a) => normName(a.rawValue) === norm);
  if (alias && candidates.some((c) => c.id === alias.targetId)) {
    return { rawValue: raw, status: "matched", targetId: alias.targetId, viaAlias: true, suggestion: null };
  }

  // 2. Exakter (normalisierter) Name
  const exact = candidates.find((c) => normName(c.name) === norm);
  if (exact) {
    return { rawValue: raw, status: "matched", targetId: exact.id, viaAlias: false, suggestion: null };
  }

  // 3. Bester Fuzzy-Kandidat
  let best: { id: string; name: string; confidence: number } | null = null;
  for (const c of candidates) {
    const sim = jaroWinkler(norm, normName(c.name));
    if (!best || sim > best.confidence) best = { id: c.id, name: c.name, confidence: sim };
  }

  if (best && best.confidence >= SUGGEST_THRESHOLD) {
    return { rawValue: raw, status: "suggested", targetId: null, viaAlias: false, suggestion: best };
  }

  return {
    rawValue: raw,
    status: "unknown",
    targetId: null,
    viaAlias: false,
    suggestion: best && best.confidence >= HINT_THRESHOLD ? best : null,
  };
}

/** Löst eine Liste von Rohwerten auf (dedupliziert, leere übersprungen). */
export function resolveEntities(
  rawValues: (string | null | undefined)[],
  candidates: EntityCandidate[],
  aliases: EntityAlias[],
): ResolveResult[] {
  const unique = [
    ...new Set(rawValues.map((v) => (v ?? "").trim()).filter(Boolean)),
  ];
  return unique.map((v) => resolveEntity(v, candidates, aliases));
}

/**
 * Baut eine schnelle Lookup-Map rawValue(normalisiert) → targetId aus
 * Kandidaten + Aliasen. Für den Schreibpfad (executeImport), wo nur eindeutige
 * Treffer (Alias oder exakter Name) zählen — Fuzzy-Vorschläge werden hier
 * bewusst NICHT automatisch angewendet.
 */
export function buildResolveMap(
  candidates: EntityCandidate[],
  aliases: EntityAlias[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of candidates) map.set(normName(c.name), c.id);
  // Aliase überschreiben/ergänzen exakte Namen (sie sind die bestätigte Wahrheit)
  for (const a of aliases) {
    if (candidates.some((c) => c.id === a.targetId)) {
      map.set(normName(a.rawValue), a.targetId);
    }
  }
  return map;
}

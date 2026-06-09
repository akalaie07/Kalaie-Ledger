"use server";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/get-current-org";
import { resolveEntities } from "@/lib/import/resolve";
import type { ResolveResult, EntityAlias, EntityCandidate } from "@/lib/import/resolve";

export type AliasEntityType = "product" | "platform" | "closer";

// Stammdaten-Tabelle je Entitätstyp
const SOURCE_TABLE: Record<AliasEntityType, "products" | "platforms" | "closers"> = {
  product: "products",
  platform: "platforms",
  closer: "closers",
};

/** Lädt gespeicherte Aliase eines Typs für die aktuelle Org. */
export async function getAliases(entityType: AliasEntityType): Promise<EntityAlias[]> {
  const session = await requireRole("admin");
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("import_aliases")
    .select("raw_value, target_id")
    .eq("organization_id", session.organizationId)
    .eq("entity_type", entityType);
  return (data ?? []).map((a: { raw_value: string; target_id: string }) => ({
    rawValue: a.raw_value,
    targetId: a.target_id,
  }));
}

/** Speichert/aktualisiert Aliase (nur Admin). Künftige Importe lösen sie automatisch auf. */
export async function saveAliases(
  entityType: AliasEntityType,
  mappings: { rawValue: string; targetId: string }[],
): Promise<{ saved: number }> {
  const session = await requireRole("admin");
  const rows = mappings
    .filter((m) => m.rawValue.trim() && m.targetId)
    .map((m) => ({
      organization_id: session.organizationId,
      entity_type: entityType,
      raw_value: m.rawValue.trim(),
      target_id: m.targetId,
      created_by: session.userId,
    }));
  if (rows.length === 0) return { saved: 0 };

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("import_aliases")
    .upsert(rows, { onConflict: "organization_id,entity_type,raw_value" });
  if (error) throw new Error(`Aliase konnten nicht gespeichert werden: ${error.message}`);
  return { saved: rows.length };
}

/**
 * Löst eine Liste von Rohwerten gegen Stammdaten + Aliase auf.
 * Liefert zusätzlich die Kandidatenliste, damit die Vorschau-UI Dropdowns rendern kann.
 */
export async function resolveImport(
  entityType: AliasEntityType,
  rawValues: string[],
): Promise<{ candidates: EntityCandidate[]; results: ResolveResult[] }> {
  const session = await requireRole("admin");
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cand } = await (supabase as any)
    .from(SOURCE_TABLE[entityType])
    .select("id, name")
    .eq("organization_id", session.organizationId);

  const candidates: EntityCandidate[] = (cand ?? []).map(
    (c: { id: string; name: string }) => ({ id: c.id, name: c.name }),
  );
  const aliases = await getAliases(entityType);
  return { candidates, results: resolveEntities(rawValues, candidates, aliases) };
}

/**
 * Legt ein neues Produkt mit dem gegebenen Namen an (oder gibt ein bereits
 * gleichnamiges zurück). Für den "Neu anlegen"-Button in der Import-Vorschau.
 */
export async function createProductForImport(
  name: string,
): Promise<{ id: string; name: string }> {
  const session = await requireRole("admin");
  const clean = name.trim();
  if (!clean) throw new Error("Produktname fehlt.");

  const supabase = await createClient();
  // Bereits vorhandenes gleichnamiges Produkt wiederverwenden (kein Duplikat).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from("products")
    .select("id, name")
    .eq("organization_id", session.organizationId)
    .eq("name", clean)
    .maybeSingle();
  if (existing) return { id: existing.id, name: existing.name };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("products")
    .insert({ organization_id: session.organizationId, name: clean })
    .select("id, name")
    .single();
  if (error || !data) {
    throw new Error(`Produkt konnte nicht angelegt werden: ${error?.message ?? "unbekannter Fehler"}`);
  }
  return { id: data.id, name: data.name };
}

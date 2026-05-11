// =============================================================================
// Gemeinsame Parser-Hilfsfunktionen für alle Platform-Adapter
// =============================================================================

/** Parst eine CSV-Zeile korrekt (mit Quote-Unterstützung). */
export function parseLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      result.push(field.trim());
      field = "";
    } else {
      field += ch;
    }
  }
  result.push(field.trim());
  return result;
}

/** Lowercase-Trim-Helfer */
export function lc(s: string): string {
  return (s ?? "").toLowerCase().trim();
}

/**
 * Parst deutschen Preis-String ins number.
 * Akzeptiert: "1.234,56 €", "1234.56", "199,00", 1234 (number)
 */
export function parseGermanPrice(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") return isNaN(val) ? null : val;
  const s = String(val)
    .replace(/[€$\s]/g, "")
    .replace(/['"]/g, "");
  if (!s) return null;
  // Format "1.234,56" (DE) → 1234.56
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) {
    return parseFloat(s.replace(/\./g, "").replace(",", "."));
  }
  // Format "1234,56" → 1234.56
  if (/^\d+(,\d{1,2})$/.test(s)) {
    return parseFloat(s.replace(",", "."));
  }
  // Format "1234.56" (EN) → as-is
  const n = parseFloat(s.replace(",", "."));
  return isNaN(n) ? null : n;
}

/**
 * Parst Datum in YYYY-MM-DD.
 * Akzeptiert: DD.MM.YYYY, YYYY-MM-DD, DD/MM/YYYY
 */
export function parseDate(val: string): string | null {
  if (!val) return null;
  const clean = val.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  const ddmm = clean.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (ddmm) {
    const [, d, m, y] = ddmm;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

/** Heutiges Datum als ISO-String (YYYY-MM-DD). */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Baut einen syntheticKey aus mehreren Teilen.
 * Parts werden mit ":" verbunden; null/undefined → leerer String.
 */
export function buildSyntheticKey(parts: (string | number | undefined | null)[]): string {
  return parts.map((p) => String(p ?? "")).join(":");
}

/**
 * Findet einen Spalten-Index in einem Header-Array.
 * Vergleicht lowercase-trimmed. Gibt -1 zurück wenn nicht gefunden.
 */
export function findColIdx(headers: string[], ...names: string[]): number {
  for (const name of names) {
    const i = headers.findIndex((h) => lc(h) === lc(name));
    if (i >= 0) return i;
  }
  return -1;
}

/**
 * Normalisiert Umlaute (ä→ae, ö→oe, ü→ue, ß→ss).
 * Nützlich für Ablefy-Headers die Umlaute als ae/oe/ue codieren.
 */
export function normUmlauts(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

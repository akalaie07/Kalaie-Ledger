/**
 * Gemeinsame Parser-Hilfsfunktionen (client- und serverseitig nutzbar).
 */

/** Parst ein Datum in YYYY-MM-DD. Akzeptiert DD.MM.YYYY, YYYY-MM-DD, DD/MM/YYYY. */
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

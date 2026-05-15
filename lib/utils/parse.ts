/**
 * Gemeinsame Parser-Hilfsfunktionen (client- und serverseitig nutzbar).
 */

/** Parst ein Datum in YYYY-MM-DD.
 *  Akzeptiert: DD.MM.YYYY, YYYY-MM-DD, DD/MM/YYYY
 *  sowie dieselben Formate mit angehängter Uhrzeit (z. B. "16.02.2025 17:09" oder "16.02.2025 17:09:43").
 */
export function parseDate(val: string): string | null {
  if (!val) return null;
  // Nehme nur den Datumsteil (vor dem ersten Leerzeichen oder T), falls eine Uhrzeit angehängt ist
  const datePart = val.trim().split(/[\sT]/)[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;
  const ddmm = datePart.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (ddmm) {
    const [, d, m, y] = ddmm;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

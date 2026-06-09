// =============================================================================
// Fuzzy-Matching für Import-Konflikte
//
// Vergleicht eine NormalizedImportRow gegen bekannte Deals und gibt
// gerankte Vorschläge zurück, falls kein exakter Bestell-ID-Match gefunden wird.
// =============================================================================

import type { NormalizedImportRow, FuzzyMatch } from "./types";
import type { DealContext } from "./preview";

export type { FuzzyMatch };

// =============================================================================
// Jaro-Winkler Ähnlichkeit
// =============================================================================

function jaro(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0;

  const matchDist = Math.max(Math.floor(Math.max(len1, len2) / 2) - 1, 0);
  const s1Matches = new Array<boolean>(len1).fill(false);
  const s2Matches = new Array<boolean>(len2).fill(false);

  let matches = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDist);
    const end = Math.min(i + matchDist + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;
}

export function jaroWinkler(s1: string, s2: string): number {
  const j = jaro(s1, s2);
  if (j < 0.7) return j;
  let prefix = 0;
  const limit = Math.min(4, Math.min(s1.length, s2.length));
  for (let i = 0; i < limit; i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }
  return j + prefix * 0.1 * (1 - j);
}

export function normName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// =============================================================================
// Haupt-Funktion
// =============================================================================

/**
 * Sucht unter allen bekannten Deals nach ähnlichen Treffern für eine
 * Import-Zeile ohne gültigen Bestell-ID-Match.
 *
 * Gibt bis zu 3 Vorschläge zurück, sortiert nach Score.
 */
export function findFuzzyMatches(
  row: NormalizedImportRow,
  allDeals: DealContext[],
  threshold = 0.55,
): FuzzyMatch[] {
  const needle = normName(row.customerName);
  const email = row.customerEmail?.toLowerCase().trim() ?? null;

  const scored: FuzzyMatch[] = [];

  for (const deal of allDeals) {
    const reasons: string[] = [];
    let score = 0;

    // 1. Name-Ähnlichkeit (Gewicht 0.5)
    const hay = normName(deal.customerName);
    const nameSim = jaroWinkler(needle, hay);
    if (nameSim >= 0.8) {
      score += nameSim * 0.5;
      reasons.push(`Name ähnlich (${Math.round(nameSim * 100)}%)`);
    } else if (nameSim >= 0.6) {
      score += nameSim * 0.3;
      reasons.push(`Name teilweise ähnlich (${Math.round(nameSim * 100)}%)`);
    } else {
      // Zu unähnlich — hart ausschließen
      continue;
    }

    // 2. E-Mail-Übereinstimmung (Gewicht 0.3)
    if (email && deal.customerEmail) {
      const dealEmail = deal.customerEmail.toLowerCase().trim();
      if (email === dealEmail) {
        score += 0.3;
        reasons.push("E-Mail stimmt überein");
      }
    }

    // 3. Betragsähnlichkeit (Gewicht 0.1)
    if (row.amount > 0 && deal.totalPrice > 0) {
      const ratio = Math.min(row.amount, deal.totalPrice) / Math.max(row.amount, deal.totalPrice);
      if (ratio >= 0.9) {
        score += 0.1;
        reasons.push("Betrag ähnlich");
      }
    }

    // 4. Produkt-Hinweis falls bekannt
    if (row.productRawName && deal.productName) {
      const pNeedle = normName(row.productRawName);
      const pHay = normName(deal.productName);
      if (pNeedle === pHay || pNeedle.includes(pHay) || pHay.includes(pNeedle)) {
        score += 0.1;
        reasons.push("Produkt passt");
      }
    }

    if (score >= threshold && reasons.length > 0) {
      scored.push({ dealId: deal.id, dealCustomerName: deal.customerName, score, reasons });
    }
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, 3);
}

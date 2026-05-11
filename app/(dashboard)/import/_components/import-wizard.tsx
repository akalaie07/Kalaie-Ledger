"use client";

import { useRef, useState, useTransition } from "react";
import { Upload, FileText, AlertTriangle, CheckCircle, X, PlusCircle, RefreshCw } from "lucide-react";
import * as XLSX from "xlsx";
import Link from "next/link";

import {
  importDeals,
  processPaymentExport,
  type ImportRow,
  type ImportResult,
  type AbgleichRow,
  type AbgleichResult,
} from "@/lib/actions/import";
import { parseDate } from "@/lib/utils/parse";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// =============================================================================
// Template-Download
// =============================================================================

const TEMPLATE_HEADERS = [
  "Kunde", "Bestell-ID", "Plattform", "Produkt", "Zahlart",
  "Closer", "Vertriebspartner", "Gesamtpreis", "Zahlungsart",
  "Abschlussdatum", "Anzahl Raten", "Erstes Fälligkeitsdatum",
  "Bezahlt", "Onboarding", "Update-Call", "Inkasso", "Notizen",
];

function downloadTemplate() {
  const rows = [
    TEMPLATE_HEADERS.join(";"),
    "Max Mustermann;ORD-001;Copecart;Kurs A;Überweisung;Hans Closer;Partner GmbH;1200;Ratenzahlung;01.01.2026;3;01.02.2026;2;ja;nein;nein;",
    "Anna Schmidt;;Digistore;Kurs B;;Lisa Closer;;500;Einmalzahlung;15.01.2026;;;;ja;;nein;Wichtiger Kunde",
  ].join("\n");
  const blob = new Blob(["﻿" + rows], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "deals-import-vorlage.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// =============================================================================
// Proper CSV-Zeilen-Parser (mit Quote-Unterstützung)
// =============================================================================

function parseLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === delimiter && !inQuotes) { result.push(field.trim()); field = ""; }
    else { field += ch; }
  }
  result.push(field.trim());
  return result;
}

// =============================================================================
// Format-Erkennung
// =============================================================================

type FormatType =
  | "column"        // Eigene Kalaie-Excel (Kunden als Spalten)
  | "standard"      // Standard CSV (eine Zeile = ein Deal)
  | "copecart"      // Copecart-Export
  | "digistore"     // Digistore-Export
  | "ablefy";       // Ablefy-Export

type ParsedFile =
  | { format: "column" | "standard"; rows: ImportRow[] }
  | { format: "copecart" | "digistore" | "ablefy"; rows: AbgleichRow[] };

type FileEntry = {
  name: string;
  parsed: ParsedFile;
};

// =============================================================================
// Platform-Export Parser (Copecart / Digistore / Ablefy)
// =============================================================================

/**
 * Erkennt das Platform-Format anhand der Header-Spalten und des Trennzeichens.
 *
 * Copecart:   Komma-getrennt, hat "Kundenname"-Spalte
 * Ablefy:     Semikolon-getrennt, hat "TRX-ID"-Spalte
 * Digistore:  Semikolon-getrennt, hat "Zahlungsstatus"-Spalte
 */
function detectPlatformFormat(headers: string[], delimiter: string): "copecart" | "digistore" | "ablefy" | null {
  const h = headers.map((x) => x.toLowerCase().trim());
  if (delimiter === "," && h.some((x) => x === "kundenname")) return "copecart";
  if (h.some((x) => x === "trx-id")) return "ablefy";
  if (h.some((x) => x === "zahlungsstatus")) return "digistore";
  return null;
}

function parseCopecart(text: string): AbgleichRow[] {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseLine(lines[0], ",");
  const lc = (s: string) => s.toLowerCase().trim();
  const idxId = headers.findIndex((h) => lc(h) === "bestell-id");
  const idxStatus = headers.findIndex((h) => lc(h) === "status");
  const idxKunde = headers.findIndex((h) => lc(h) === "kundenname");
  const idxPrice = headers.findIndex((h) => lc(h) === "nettopreis" || lc(h) === "betrag");
  const idxProduct = headers.findIndex((h) => lc(h) === "produktname");
  const idxRate = headers.findIndex((h) => lc(h) === "anzahl der rate" || lc(h) === "rate nr.");
  const idxDate = headers.findIndex((h) => lc(h) === "datum" || lc(h) === "transaktionsdatum" || lc(h) === "bestelldatum");
  const idxPlan = headers.findIndex((h) => lc(h) === "zahlungsplan" || lc(h) === "zahlungsart");
  const idxTotalRates = headers.findIndex((h) => lc(h) === "gesamtrate" || lc(h) === "raten gesamt" || lc(h) === "anzahl raten");
  if (idxId < 0 || idxStatus < 0) return [];
  return lines.slice(1).flatMap((line) => {
    const cols = parseLine(line, ",");
    const orderId = cols[idxId];
    if (!orderId) return [];
    const status = lc(cols[idxStatus] ?? "");
    const seq = idxRate >= 0 ? parseInt(cols[idxRate] ?? "", 10) : NaN;
    const rawPrice = idxPrice >= 0 ? parseFloat((cols[idxPrice] ?? "").replace(",", ".")) : NaN;
    const rawDate = idxDate >= 0 ? cols[idxDate]?.trim() : undefined;
    const parsedDate = rawDate ? (parseDate(rawDate) ?? undefined) : undefined;
    const planRaw = idxPlan >= 0 ? lc(cols[idxPlan] ?? "") : "";
    const isSubscription = planRaw.includes("abo") || planRaw.includes("subscription");
    const isInstallment = planRaw.includes("rate") || planRaw.includes("teilzahl");
    const payment_plan: "one_time" | "installments" | undefined =
      isSubscription || isInstallment ? "installments" : planRaw.includes("einmal") ? "one_time" : undefined;
    const totalRatesRaw = idxTotalRates >= 0 ? parseInt(cols[idxTotalRates] ?? "", 10) : NaN;
    return [{
      order_id: orderId,
      platform: "copecart" as const,
      status: status === "bezahlt" ? "paid" : status.includes("erstattet") ? "refunded" : "failed",
      installment_sequence: !isNaN(seq) && seq > 0 ? seq : undefined,
      customer_name: idxKunde >= 0 ? (cols[idxKunde]?.trim() || undefined) : undefined,
      amount: !isNaN(rawPrice) && rawPrice > 0 ? rawPrice : undefined,
      product_name: idxProduct >= 0 ? (cols[idxProduct]?.trim() || undefined) : undefined,
      date: parsedDate,
      payment_plan,
      total_installments: !isNaN(totalRatesRaw) && totalRatesRaw > 0 ? totalRatesRaw : undefined,
    }];
  });
}

function parseDigistore(text: string): AbgleichRow[] {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseLine(lines[0], ";");
  const lc = (s: string) => s.toLowerCase().trim();
  const idxId = headers.findIndex((h) => lc(h) === "bestell-id");
  const idxZStatus = headers.findIndex((h) => lc(h) === "zahlungsstatus");
  const idxVorname = headers.findIndex((h) => lc(h) === "vorname");
  const idxNachname = headers.findIndex((h) => lc(h) === "nachname");
  const idxProduct = headers.findIndex((h) => lc(h) === "produktname");
  const idxPrice = headers.findIndex((h) => lc(h) === "erste zahlung" || lc(h) === "ratenbetrag" || lc(h) === "preis");
  const idxDate = headers.findIndex((h) => lc(h) === "erste zahlung am" || lc(h) === "datum" || lc(h) === "bestelldatum");
  const idxPlan = headers.findIndex((h) => lc(h) === "abrechnungstyp" || lc(h) === "zahlungstyp");
  const idxTotalRates = headers.findIndex((h) => lc(h) === "anzahl zahlungen" || lc(h) === "raten" || lc(h) === "laufzeit");
  if (idxId < 0) return [];
  return lines.slice(1).flatMap((line) => {
    const cols = parseLine(line, ";");
    const orderId = cols[idxId];
    if (!orderId) return [];
    const zStatus = lc(cols[idxZStatus] ?? "");
    const isPaid = zStatus.includes("vollständig") || zStatus.includes("aktiv") || zStatus.includes("abgeschlossen");
    const isRefunded = zStatus.includes("abgebrochen") || zStatus.includes("rückgabe") || zStatus.includes("erstattet");
    const vorname = idxVorname >= 0 ? (cols[idxVorname]?.trim() ?? "") : "";
    const nachname = idxNachname >= 0 ? (cols[idxNachname]?.trim() ?? "") : "";
    const customer_name = [vorname, nachname].filter(Boolean).join(" ") || undefined;
    const rawPrice = idxPrice >= 0 ? parseFloat((cols[idxPrice] ?? "").replace(".", "").replace(",", ".")) : NaN;
    const rawDate = idxDate >= 0 ? cols[idxDate]?.trim() : undefined;
    const parsedDate = rawDate ? (parseDate(rawDate) ?? undefined) : undefined;
    const planRaw = idxPlan >= 0 ? lc(cols[idxPlan] ?? "") : "";
    const isInstallment = planRaw.includes("rate") || planRaw.includes("teilzahl") || planRaw.includes("abo");
    const payment_plan: "one_time" | "installments" | undefined =
      isInstallment ? "installments" : planRaw.includes("einmal") ? "one_time" : undefined;
    const totalRatesRaw = idxTotalRates >= 0 ? parseInt(cols[idxTotalRates] ?? "", 10) : NaN;
    return [{
      order_id: orderId,
      platform: "digistore" as const,
      status: isPaid ? "paid" : isRefunded ? "refunded" : "failed",
      customer_name,
      product_name: idxProduct >= 0 ? (cols[idxProduct]?.trim() || undefined) : undefined,
      amount: !isNaN(rawPrice) && rawPrice > 0 ? rawPrice : undefined,
      date: parsedDate,
      payment_plan,
      total_installments: !isNaN(totalRatesRaw) && totalRatesRaw > 0 ? totalRatesRaw : undefined,
    }];
  });
}

function parseAblefy(text: string): AbgleichRow[] {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseLine(lines[0], ";");
  // Ablefy nutzt Umlaute als "ae", "ue", "oe" in Headern (z.B. KAeUFER)
  const norm = (s: string) => s.toLowerCase().trim();
  const lch = headers.map(norm);
  // BESTELL-ID steht weit hinten, direkt per find
  const idxId = lch.findIndex((h) => h === "bestell-id");
  const idxStatus = lch.findIndex((h) => h === "status");
  const idxVorname = lch.findIndex((h) => h.includes("kaeufer") && h.includes("vorname"));
  const idxNachname = lch.findIndex((h) => h.includes("kaeufer") && h.includes("nachname"));
  const idxProduct = lch.findIndex((h) => h === "produktname");
  const idxBezahlt = lch.findIndex((h) => h === "bezahlt");
  const idxFaelligkeit = lch.findIndex((h) => h.includes("faelligkeiten") || h.includes("fälligkeiten"));
  const idxDate = lch.findIndex((h) => h === "datum" || h === "erstellt am" || h === "transaktionsdatum" || h === "zahlungsdatum");
  const idxPlan = lch.findIndex((h) => h === "zahlungsplan" || h === "plan" || h === "zahlungstyp");
  if (idxId < 0) return [];
  const seqMap = new Map<string, number>();
  return lines.slice(1).flatMap((line) => {
    const cols = parseLine(line, ";");
    const orderId = cols[idxId];
    if (!orderId) return [];
    const status = norm(cols[idxStatus] ?? "");
    const isPaid = status.includes("erfolgreich") || status.includes("bezahlt") || status.includes("abgeschlossen");
    const isRefunded = status.includes("erstattet") || status.includes("rückgabe") || status.includes("storniert");
    const seq = (seqMap.get(orderId) ?? 0) + 1;
    seqMap.set(orderId, seq);
    const vorname = idxVorname >= 0 ? (cols[idxVorname]?.trim() ?? "") : "";
    const nachname = idxNachname >= 0 ? (cols[idxNachname]?.trim() ?? "") : "";
    const customer_name = [vorname, nachname].filter(Boolean).join(" ") || undefined;
    const rawPrice = idxBezahlt >= 0 ? parseFloat((cols[idxBezahlt] ?? "").replace(".", "").replace(",", ".")) : NaN;
    const rawDate = idxDate >= 0 ? cols[idxDate]?.trim() : undefined;
    const parsedDate = rawDate ? (parseDate(rawDate) ?? undefined) : undefined;
    // Zahlungsplan parsen: "12 Raten" → installments:12, "Einmal" / "Einzahlung" → one_time
    const planRaw = idxPlan >= 0 ? (cols[idxPlan]?.trim() ?? "") : "";
    const planNorm = norm(planRaw);
    let payment_plan: "one_time" | "installments" | undefined;
    let total_installments: number | undefined;
    if (planNorm.includes("rate") || planNorm.includes("abo") || planNorm.includes("subscription")) {
      payment_plan = "installments";
      // "12 Raten" → 12
      const match = planRaw.match(/(\d+)/);
      if (match) total_installments = parseInt(match[1], 10);
    } else if (planNorm.includes("einmal") || planNorm.includes("einzahlung") || planNorm.includes("one")) {
      payment_plan = "one_time";
    }
    return [{
      order_id: orderId,
      platform: "ablefy" as const,
      status: isPaid ? "paid" : isRefunded ? "refunded" : "failed",
      installment_sequence: idxFaelligkeit >= 0 ? seq : undefined,
      customer_name,
      product_name: idxProduct >= 0 ? (cols[idxProduct]?.trim() || undefined) : undefined,
      amount: !isNaN(rawPrice) && rawPrice > 0 ? rawPrice : undefined,
      date: parsedDate,
      payment_plan,
      total_installments,
    }];
  });
}

// =============================================================================
// Standard CSV Mapper
// =============================================================================

function mapStandardRow(raw: Record<string, string>): ImportRow {
  const get = (keys: string[]): string => {
    for (const k of keys) {
      const found = Object.entries(raw).find(([key]) => key.toLowerCase().trim() === k.toLowerCase());
      if (found?.[1]) return found[1];
    }
    return "";
  };
  return {
    customer_name: get(["kunde", "customer", "customer_name", "name"]),
    order_id: get(["bestell-id", "order_id", "order id", "bestellnummer"]),
    platform_name: get(["plattform", "platform"]),
    product_name: get(["produkt", "product"]),
    payment_method: get(["zahlart", "payment_method", "zahlungsmethode"]),
    closer_name: get(["closer"]),
    sales_partner_name: get(["vertriebspartner", "sales_partner", "partner"]),
    total_price: get(["gesamtpreis", "preis", "total_price", "price", "betrag"]),
    payment_type: get(["zahlungsart", "payment_type"]),
    close_date: get(["abschlussdatum", "close_date", "datum", "date"]),
    number_of_rates: get(["anzahl raten", "number_of_rates", "raten"]),
    first_due_date: get(["erstes fälligkeitsdatum", "first_due_date", "fälligkeitsdatum"]),
    bezahlt_raten: get(["bezahlt", "bezahlt_raten", "paid_rates", "paid"]),
    onboarding_done: get(["onboarding"]),
    update_call_done: get(["update-call", "update_call"]),
    inkasso_required: get(["inkasso"]),
    notes: get(["notizen", "notes", "anmerkungen"]),
  };
}

// =============================================================================
// Kalaie/MSM Spalten-Format Parser
// =============================================================================

function parseGermanPrice(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") return isNaN(val) ? null : val;
  const s = String(val);
  let clean = s.replace(/€/g, "").replace(/\s/g, "");
  if (/^\d{1,3}(,\d{3})*(\.\d+)?$/.test(clean)) clean = clean.replace(/,/g, "");
  else clean = clean.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

function normLabel(val: unknown): string {
  return String(val ?? "").trim().toLowerCase().replace(/:$/, "").replace(/\s+/g, " ");
}

function detectPlatformFromDesc(desc: string): string {
  const d = desc.toLowerCase();
  if (d.includes("copecart") || d.includes("cope")) return "Copecart";
  if (d.includes("digistore")) return "Digistore";
  if (d.includes("ablify") || d.includes("ablefy")) return "Ablefy";
  return "";
}

function parseColumnBasedRows(rawRows: unknown[][]): ImportRow[] | null {
  if (rawRows.length < 5) return null;

  const rowByLabel = new Map<string, unknown[]>();
  for (const row of rawRows) {
    const label = normLabel(row[0]);
    if (label) rowByLabel.set(label, row.slice(1));
  }

  const totalRow = rowByLabel.get("gesamtpaket") ?? rowByLabel.get("preispaket") ?? rowByLabel.get("gesamtpreis");
  const orderIdRow = rowByLabel.get("bestell-id") ?? rowByLabel.get("bestl. id") ?? rowByLabel.get("bestell id") ?? rowByLabel.get("bestellnummer");

  // Abschlussdatum-Zeile suchen
  const closeDateRow = rowByLabel.get("abschlussdatum") ?? rowByLabel.get("abschluss") ?? rowByLabel.get("datum");

  if (!totalRow) return null;

  let customerNames: unknown[] = [];
  let descRow: unknown[] = [];

  for (const row of rawRows) {
    const labelCell = String(row[0] ?? "").trim();
    if (labelCell === "" && row.slice(1).some((c) => String(c ?? "").trim())) {
      customerNames = row.slice(1);
      break;
    }
    if (normLabel(row[0]) === "rate") descRow = row.slice(1);
  }

  const rateRow = rowByLabel.get("rate");
  if (rateRow && rateRow.some((v) => String(v ?? "").trim().length > 3)) descRow = rateRow;

  if (customerNames.every((c) => !String(c ?? "").trim())) {
    customerNames = rawRows[1]?.slice(1) ?? [];
  }

  const rateRows: unknown[][] = [];
  for (let r = 1; r <= 20; r++) {
    const row = rowByLabel.get(`${r}.rate`) ?? rowByLabel.get(`${r}.rate `);
    if (row) rateRows.push(row);
  }

  const deals: ImportRow[] = [];

  for (let col = 0; col < customerNames.length; col++) {
    const name = String(customerNames[col] ?? "").trim();
    if (!name) continue;

    const totalPrice = parseGermanPrice(totalRow[col]);
    if (!totalPrice || totalPrice <= 0) continue;

    const filledRates = rateRows.filter((r) => { const v = parseGermanPrice(r[col]); return v !== null && v > 0; });
    const numRates = filledRates.length;
    const paymentType = numRates > 1 ? "Ratenzahlung" : "Einmalzahlung";

    const desc = String(descRow[col] ?? "").trim().replace(/^\n/, "");
    const orderId = String(orderIdRow?.[col] ?? "").trim().replace(/^\n/, "");
    const platform = detectPlatformFromDesc(desc);

    // Abschlussdatum aus der Datei lesen falls vorhanden
    const rawCloseDate = closeDateRow ? String(closeDateRow[col] ?? "").trim() : "";
    const parsedCloseDate = rawCloseDate ? (parseDate(rawCloseDate) ?? "") : "";

    deals.push({
      customer_name: name,
      order_id: orderId || undefined,
      platform_name: platform || undefined,
      total_price: totalPrice.toString(),
      payment_type: paymentType,
      close_date: parsedCloseDate,
      number_of_rates: numRates > 1 ? numRates.toString() : undefined,
      notes: desc || undefined,
    });
  }

  return deals.length > 0 ? deals : null;
}

// =============================================================================
// Datei-Parsing Entry Point
// =============================================================================

function parseXlsx(buffer: ArrayBuffer): ParsedFile | string {
  try {
    const wb = XLSX.read(buffer, { type: "array" });
    const allDeals: ImportRow[] = [];
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
      const parsed = parseColumnBasedRows(raw);
      if (parsed) allDeals.push(...parsed);
    }
    if (allDeals.length === 0) return "Kein Deal erkannt. Stelle sicher, dass die Datei eine 'Preispaket'- oder 'Gesamtpaket'-Zeile enthält.";
    return { format: "column", rows: allDeals };
  } catch {
    return "Datei konnte nicht gelesen werden.";
  }
}

function parseCsvText(text: string): ParsedFile | string {
  const firstLine = text.split("\n")[0] ?? "";
  const delimiter = firstLine.includes(";") ? ";" : ",";
  const headers = parseLine(firstLine, delimiter);

  // Platform-Export erkennen
  const platform = detectPlatformFormat(headers, delimiter);
  if (platform === "copecart") {
    const rows = parseCopecart(text);
    if (rows.length === 0) return "Keine Transaktionen in der Copecart-Datei gefunden.";
    return { format: "copecart", rows };
  }
  if (platform === "digistore") {
    const rows = parseDigistore(text);
    if (rows.length === 0) return "Keine Transaktionen in der Digistore-Datei gefunden.";
    return { format: "digistore", rows };
  }
  if (platform === "ablefy") {
    const rows = parseAblefy(text);
    if (rows.length === 0) return "Keine Transaktionen in der Ablefy-Datei gefunden.";
    return { format: "ablefy", rows };
  }

  // Spalten-Format (Kalaie Excel) oder Standard CSV
  const rawRows = text.split("\n").map((line) => line.split(delimiter).map((cell) => cell.replace(/^"|"$/g, "").trim()));
  const colParsed = parseColumnBasedRows(rawRows);
  if (colParsed) return { format: "column", rows: colParsed };

  // Standard CSV Fallback
  const rows = rawRows.slice(1)
    .filter((r) => r.some((c) => c.trim()))
    .map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = r[i] ?? ""; });
      return mapStandardRow(obj);
    })
    .filter((r) => r.customer_name);

  if (rows.length === 0) return "Keine Deals gefunden. Prüfe ob die Datei das richtige Format hat.";
  return { format: "standard", rows };
}

// =============================================================================
// Hilfsfunktionen für UI
// =============================================================================

const FORMAT_LABEL: Record<FormatType, string> = {
  column: "Tabellen-Format (Kalaie)",
  standard: "Standard-CSV",
  copecart: "Copecart-Export",
  digistore: "Digistore-Export",
  ablefy: "Ablefy-Export",
};

const FORMAT_COLOR: Record<FormatType, string> = {
  column: "bg-blue-500/15 text-blue-400",
  standard: "bg-emerald-500/15 text-emerald-400",
  copecart: "bg-purple-500/15 text-purple-400",
  digistore: "bg-amber-500/15 text-amber-400",
  ablefy: "bg-cyan-500/15 text-cyan-400",
};

// =============================================================================
// Haupt-Komponente
// =============================================================================

export function ImportWizard() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Multi-Datei Support
  const [fileEntries, setFileEntries] = useState<FileEntry[]>([]);
  const [parseErrors, setParseErrors] = useState<{ name: string; msg: string }[]>([]);
  const [importResults, setImportResults] = useState<{ name: string; result: ImportResult | AbgleichResult; type: "import" | "abgleich" }[]>([]);
  const [pending, startTransition] = useTransition();
  const [defaultDate, setDefaultDate] = useState(new Date().toISOString().slice(0, 10));

  const hasFiles = fileEntries.length > 0;
  const hasDone = importResults.length > 0;

  function applyDefaultDate(rows: ImportRow[], date: string): ImportRow[] {
    return rows.map((r) => ({ ...r, close_date: r.close_date || date }));
  }

  function processFile(file: File): Promise<{ entry: FileEntry | null; error: { name: string; msg: string } | null }> {
    return new Promise((resolve) => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext === "xlsx" || ext === "xls") {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = parseXlsx(e.target!.result as ArrayBuffer);
          if (typeof result === "string") {
            resolve({ entry: null, error: { name: file.name, msg: result } });
          } else {
            const parsed = result.format === "column"
              ? { format: result.format as "column", rows: applyDefaultDate(result.rows as ImportRow[], defaultDate) }
              : result;
            resolve({ entry: { name: file.name, parsed }, error: null });
          }
        };
        reader.readAsArrayBuffer(file);
      } else if (ext === "csv") {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = parseCsvText(e.target!.result as string);
          if (typeof result === "string") {
            resolve({ entry: null, error: { name: file.name, msg: result } });
          } else {
            const parsed = result.format === "column"
              ? { format: result.format as "column", rows: applyDefaultDate(result.rows as ImportRow[], defaultDate) }
              : result;
            resolve({ entry: { name: file.name, parsed }, error: null });
          }
        };
        reader.readAsText(file, "utf-8");
      } else {
        resolve({ entry: null, error: { name: file.name, msg: "Nur CSV oder Excel-Dateien (.xlsx) werden unterstützt." } });
      }
    });
  }

  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    const newEntries: FileEntry[] = [];
    const newErrors: { name: string; msg: string }[] = [];
    for (const file of arr) {
      const { entry, error } = await processFile(file);
      if (entry) newEntries.push(entry);
      if (error) newErrors.push(error);
    }
    setFileEntries((prev) => {
      // Duplikate (gleicher Name) entfernen
      const existingNames = new Set(prev.map((e) => e.name));
      return [...prev, ...newEntries.filter((e) => !existingNames.has(e.name))];
    });
    setParseErrors((prev) => [...prev, ...newErrors]);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  }

  function removeEntry(name: string) {
    setFileEntries((prev) => prev.filter((e) => e.name !== name));
  }

  function handleImportAll() {
    if (fileEntries.length === 0) return;
    startTransition(async () => {
      const results: typeof importResults = [];
      for (const entry of fileEntries) {
        const fmt = entry.parsed.format;
        const isOwn = fmt === "column" || fmt === "standard";
        if (isOwn) {
          const rows = entry.parsed.rows as ImportRow[];
          const res = await importDeals(rows);
          results.push({ name: entry.name, result: res, type: "import" });
        } else {
          const rows = entry.parsed.rows as AbgleichRow[];
          const res = await processPaymentExport(rows);
          results.push({ name: entry.name, result: res, type: "abgleich" });
        }
      }
      setImportResults(results);
      setFileEntries([]);
    });
  }

  function handleDateChange(date: string) {
    setDefaultDate(date);
    setFileEntries((prev) =>
      prev.map((entry) => {
        if (entry.parsed.format === "column") {
          return {
            ...entry,
            parsed: {
              format: "column" as const,
              rows: applyDefaultDate(entry.parsed.rows as ImportRow[], date),
            },
          };
        }
        return entry;
      }),
    );
  }

  function fullReset() {
    setFileEntries([]);
    setParseErrors([]);
    setImportResults([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const fmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

  return (
    <div className="space-y-6">
      {/* Info */}
      <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-3">
        <p className="text-sm font-medium">Unterstützte Formate — alles in einem Import</p>
        <div className="grid sm:grid-cols-2 gap-3 text-sm text-muted-foreground">
          <div className="space-y-1">
            <p className="font-medium text-foreground">📊 Excel / CSV (eigene Tabelle)</p>
            <p>Deine Buchhaltungs-Tabelle (Kalaie-Format) oder Standard-CSV. Bestehende Deals werden per Bestell-ID geupdated, neue angelegt.</p>
            <button onClick={downloadTemplate} className="text-xs text-foreground underline underline-offset-4 hover:no-underline mt-1">
              Vorlage herunterladen
            </button>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-foreground">💳 Platform-Exports</p>
            <p>CSV-Export von Copecart, Digistore oder Ablefy — mehrere Dateien gleichzeitig möglich.</p>
            <div className="flex gap-1.5 mt-1 flex-wrap">
              {["Copecart", "Digistore", "Ablefy"].map((p) => (
                <span key={p} className="rounded-full border border-border px-2 py-0.5 text-xs">{p}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Drop zone — immer sichtbar wenn noch keine Ergebnisse */}
      {!hasDone && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "rounded-lg border-2 border-dashed border-border bg-muted/10 px-8 py-10 text-center space-y-3 transition-colors hover:border-border/80 cursor-pointer",
            hasFiles && "py-6",
          )}
        >
          <div className="flex justify-center">
            <div className="rounded-full bg-muted p-3">
              <Upload className="h-6 w-6 text-muted-foreground" />
            </div>
          </div>
          <div>
            <p className="font-medium">
              {hasFiles ? "Weitere Datei(en) hinzufügen" : "Excel (.xlsx) oder CSV hochladen"}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Klicken oder Dateien hier ablegen — mehrere Dateien gleichzeitig möglich
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            multiple
            className="hidden"
            onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); }}
          />
        </div>
      )}

      {/* Parse-Fehler */}
      {parseErrors.length > 0 && (
        <div className="space-y-2">
          {parseErrors.map((err, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span><span className="font-medium">{err.name}:</span> {err.msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* Datei-Liste mit Preview */}
      {fileEntries.length > 0 && (
        <div className="space-y-4">
          {/* Abschlussdatum für Kalaie-Dateien */}
          {fileEntries.some((e) => e.parsed.format === "column") && (
            <div className="flex items-center gap-2 text-sm">
              <Label htmlFor="default_date" className="text-muted-foreground whitespace-nowrap">
                Abschlussdatum (Standard für Kalaie-Format):
              </Label>
              <Input
                id="default_date"
                type="date"
                value={defaultDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="h-7 w-36 text-xs"
              />
            </div>
          )}

          {fileEntries.map((entry) => {
            const isOwn = entry.parsed.format === "column" || entry.parsed.format === "standard";
            const rows = entry.parsed.rows;

            return (
              <div key={entry.name} className="rounded-lg border border-border overflow-hidden">
                {/* Datei-Header */}
                <div className="flex items-center justify-between px-3 py-2 bg-muted/20 border-b border-border">
                  <div className="flex items-center gap-2 flex-wrap">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium">{entry.name}</span>
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                      FORMAT_COLOR[entry.parsed.format],
                    )}>
                      {FORMAT_LABEL[entry.parsed.format]}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {isOwn
                        ? `${rows.length} Deals`
                        : (() => {
                            const pRows = rows as AbgleichRow[];
                            const paid = pRows.filter((r) => r.status === "paid").length;
                            const refunded = pRows.filter((r) => r.status === "refunded").length;
                            const failed = pRows.filter((r) => r.status === "failed").length;
                            const parts = [`${pRows.length} Transaktionen`, `${paid} bezahlt`];
                            if (refunded > 0) parts.push(`${refunded} erstattet`);
                            if (failed > 0) parts.push(`${failed} fehlgeschlagen`);
                            return parts.join(" · ");
                          })()
                      }
                    </span>
                  </div>
                  <button
                    onClick={() => removeEntry(entry.name)}
                    className="text-muted-foreground hover:text-foreground shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Preview-Tabelle */}
                <div className="overflow-auto max-h-56">
                  {isOwn ? (
                    <table className="w-full text-xs">
                      <thead className="border-b border-border bg-muted/20 sticky top-0">
                        <tr>
                          {["Kunde", "Bestell-ID", "Preis", "Zahlungsart", "Raten", "Bezahlt", "Abschluss", "Plattform"].map((h) => (
                            <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {(rows as ImportRow[]).slice(0, 20).map((r, i) => (
                          <tr key={i} className={cn(!r.customer_name && "opacity-50 bg-destructive/5")}>
                            <td className="px-3 py-1.5 font-medium whitespace-nowrap">{r.customer_name || "—"}</td>
                            <td className="px-3 py-1.5 font-mono text-muted-foreground whitespace-nowrap">{r.order_id || "—"}</td>
                            <td className="px-3 py-1.5 tabular-nums whitespace-nowrap">
                              {r.total_price ? fmt.format(Number(r.total_price)) : "—"}
                            </td>
                            <td className="px-3 py-1.5 whitespace-nowrap">{r.payment_type || "—"}</td>
                            <td className="px-3 py-1.5 text-center">{r.number_of_rates || (r.payment_type?.toLowerCase().includes("einmal") ? "1" : "—")}</td>
                            <td className="px-3 py-1.5 whitespace-nowrap">{r.bezahlt_raten || "—"}</td>
                            <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{r.close_date || "—"}</td>
                            <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{r.platform_name || "—"}</td>
                          </tr>
                        ))}
                        {rows.length > 20 && (
                          <tr><td colSpan={8} className="px-3 py-2 text-center text-muted-foreground">+ {rows.length - 20} weitere…</td></tr>
                        )}
                      </tbody>
                    </table>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="border-b border-border bg-muted/20 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Bestell-ID</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Kunde</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Produkt</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Betrag</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {(rows as AbgleichRow[]).slice(0, 20).map((r, i) => (
                          <tr key={i} className={cn(r.status !== "paid" && "opacity-40")}>
                            <td className="px-3 py-1.5 font-mono text-muted-foreground">{r.order_id}</td>
                            <td className="px-3 py-1.5 whitespace-nowrap">{r.customer_name || "—"}</td>
                            <td className="px-3 py-1.5 max-w-[160px] truncate text-muted-foreground">{r.product_name || "—"}</td>
                            <td className="px-3 py-1.5 tabular-nums whitespace-nowrap">{r.amount != null ? fmt.format(r.amount) : "—"}</td>
                            <td className="px-3 py-1.5">
                              <span className={cn(
                                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                                r.status === "paid" ? "bg-emerald-500/15 text-emerald-400"
                                  : r.status === "refunded" ? "bg-amber-500/15 text-amber-400"
                                  : "bg-muted text-muted-foreground",
                              )}>
                                {r.status === "paid" ? "Bezahlt" : r.status === "refunded" ? "Erstattet" : "Übersprungen"}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 text-muted-foreground">
                              {r.installment_sequence ? `Rate ${r.installment_sequence}` : "—"}
                            </td>
                          </tr>
                        ))}
                        {rows.length > 20 && (
                          <tr><td colSpan={6} className="px-3 py-2 text-center text-muted-foreground">+ {rows.length - 20} weitere…</td></tr>
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            );
          })}

          {/* Import-Button für alle Dateien */}
          <div className="flex gap-3 pt-1">
            <Button onClick={handleImportAll} disabled={pending}>
              {pending
                ? "Wird verarbeitet…"
                : fileEntries.length === 1
                ? (() => {
                    const e = fileEntries[0];
                    const isOwn = e.parsed.format === "column" || e.parsed.format === "standard";
                    return isOwn
                      ? `${e.parsed.rows.length} Deals importieren`
                      : `${(e.parsed.rows as AbgleichRow[]).filter((r) => r.status === "paid").length} Zahlungen abgleichen`;
                  })()
                : `${fileEntries.length} Dateien verarbeiten`}
            </Button>
            <Button variant="outline" onClick={fullReset}>Abbrechen</Button>
          </div>
        </div>
      )}

      {/* Ergebnisse */}
      {importResults.length > 0 && (
        <div className="space-y-4">
          {importResults.map((res, i) => {
            const isImport = res.type === "import";
            const ir = isImport ? (res.result as ImportResult) : null;
            const ar = !isImport ? (res.result as AbgleichResult) : null;
            const hasError = isImport
              ? (ir!.errors.length > 0)
              : (ar!.errors.length > 0 || ar!.notFound.length > 0);

            return (
              <div key={i} className={cn(
                "rounded-lg border p-4 space-y-2",
                hasError ? "border-amber-500/40 bg-amber-500/10" : "border-emerald-500/40 bg-emerald-500/10",
              )}>
                <div className="flex items-center gap-2">
                  {hasError
                    ? <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                    : <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />}
                  <span className="text-sm font-medium text-muted-foreground truncate">{res.name}</span>
                </div>

                {isImport && ir && (
                  <p className="text-sm font-medium">
                    {ir.imported > 0 && `${ir.imported} neu angelegt`}
                    {ir.imported > 0 && (ir.updated > 0 || ir.skipped > 0) && " · "}
                    {ir.updated > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <RefreshCw className="h-3 w-3" />
                        {ir.updated} aktualisiert
                      </span>
                    )}
                    {ir.skipped > 0 && ` · ${ir.skipped} übersprungen`}
                    {ir.imported === 0 && ir.updated === 0 && "Keine neuen Deals."}
                  </p>
                )}

                {!isImport && ar && (
                  <p className="text-sm font-medium">
                    {(() => {
                      const parts: string[] = [];
                      if (ar.updated > 0) parts.push(`${ar.updated} bezahlt`);
                      if (ar.enriched > 0) parts.push(`${ar.enriched} angereichert`);
                      if (ar.created > 0) parts.push(`${ar.created} neu angelegt`);
                      if (ar.refunded > 0) parts.push(`${ar.refunded} erstattet`);
                      if (ar.failed > 0) parts.push(`${ar.failed} fehlgeschlagen`);
                      return parts.length > 0 ? parts.join(" · ") : "Keine Änderungen.";
                    })()}
                  </p>
                )}

                {!isImport && ar && (ar.refunded > 0 || ar.failed > 0) && (
                  <p className="text-xs text-muted-foreground">
                    Erstattete und fehlgeschlagene Transaktionen werden nicht in die Buchhaltung übernommen.
                  </p>
                )}

                {!isImport && ar && ar.created > 0 && (
                  <div className="flex items-start gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2">
                    <PlusCircle className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-400">
                      {ar.created} Deal(s) automatisch aus dem Platform-Export angelegt — bitte kurz prüfen und ggf. Produkt ergänzen.{" "}
                      <Link href="/deals" className="underline underline-offset-2 hover:text-blue-300">Zu den Deals →</Link>
                    </p>
                  </div>
                )}

                {isImport && ir && ir.errors.length > 0 && (
                  <ul className="space-y-1 text-xs text-amber-400">
                    {ir.errors.slice(0, 5).map((e, j) => <li key={j}>• {e}</li>)}
                    {ir.errors.length > 5 && <li>+ {ir.errors.length - 5} weitere…</li>}
                  </ul>
                )}
                {!isImport && ar && ar.errors.length > 0 && (
                  <ul className="space-y-1 text-xs text-rose-400">
                    {ar.errors.slice(0, 5).map((e, j) => <li key={j}>• {e}</li>)}
                    {ar.errors.length > 5 && <li>+ {ar.errors.length - 5} weitere…</li>}
                  </ul>
                )}
              </div>
            );
          })}
          <Button variant="outline" onClick={fullReset}>Weiteren Import starten</Button>
        </div>
      )}
    </div>
  );
}

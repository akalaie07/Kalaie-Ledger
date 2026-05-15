"use client";

import { useRef, useState, useTransition } from "react";
import {
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle,
  X,
  PlusCircle,
  RefreshCw,
  Eye,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";
import * as XLSX from "xlsx";
import Link from "next/link";

import {
  importDeals,
  type ImportRow,
  type ImportResult,
} from "@/lib/actions/import";
import { previewImport } from "@/lib/actions/import-preview";
import {
  executeImport,
  type ExecuteResult,
} from "@/lib/actions/import-execute";
import {
  parseCopecartExport,
  parseAblefyExport,
  parseDigistoreExport,
  parseLegacyXlsxImport,
} from "@/lib/import";
import type { NormalizedImportRow, PreviewItem, PreviewClassification } from "@/lib/import";
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
  "Closer", "Gesamtpreis", "Zahlungsart",
  "Abschlussdatum", "Anzahl Raten", "Erstes Fälligkeitsdatum",
  "Bezahlt", "Onboarding", "Update-Call", "Inkasso", "Notizen",
];

function downloadTemplate() {
  const rows = [
    TEMPLATE_HEADERS.join(";"),
    "Max Mustermann;ORD-001;Copecart;Kurs A;Überweisung;Hans Closer;1200;Ratenzahlung;01.01.2026;3;01.02.2026;2;ja;nein;nein;",
    "Anna Schmidt;;Digistore;Kurs B;;Lisa Closer;500;Einmalzahlung;15.01.2026;;;;ja;;nein;Wichtiger Kunde",
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
// CSV-Zeilen-Parser
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

type FormatType = "column" | "standard" | "copecart" | "digistore" | "ablefy";

type ParsedFile = {
  format: FormatType;
  /** Nur für column/standard — wird direkt an importDeals übergeben */
  importRows: ImportRow[];
  /** Für alle Platform-Exporte und Kalaie-XLSX — wird an executeImport übergeben */
  normalized: NormalizedImportRow[];
};

type FileEntry = { name: string; parsed: ParsedFile };

function detectPlatformFormat(
  headers: string[],
  delimiter: string,
): "copecart" | "digistore" | "ablefy" | null {
  const h = headers.map((x) => x.toLowerCase().trim());
  if (delimiter === "," && h.some((x) => x === "kundenname")) return "copecart";
  if (h.some((x) => x === "trx-id")) return "ablefy";
  if (h.some((x) => x === "zahlungsstatus")) return "digistore";
  return null;
}


// =============================================================================
// Standard CSV Mapper
// =============================================================================

function mapStandardRow(raw: Record<string, string>): ImportRow {
  const get = (keys: string[]): string => {
    for (const k of keys) {
      const found = Object.entries(raw).find(
        ([key]) => key.toLowerCase().trim() === k.toLowerCase(),
      );
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
// Kalaie Spalten-Format Hilfsfunktionen
// =============================================================================

function parseGermanPriceLocal(val: unknown): number | null {
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
  const totalRow =
    rowByLabel.get("gesamtpaket") ??
    rowByLabel.get("preispaket") ??
    rowByLabel.get("gesamtpreis");
  const orderIdRow =
    rowByLabel.get("bestell-id") ??
    rowByLabel.get("bestl. id") ??
    rowByLabel.get("bestell id") ??
    rowByLabel.get("bestellnummer");
  const closeDateRow =
    rowByLabel.get("abschlussdatum") ??
    rowByLabel.get("abschluss") ??
    rowByLabel.get("datum");
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
    const totalPrice = parseGermanPriceLocal(totalRow[col]);
    if (!totalPrice || totalPrice <= 0) continue;
    const filledRates = rateRows.filter((r) => {
      const v = parseGermanPriceLocal(r[col]);
      return v !== null && v > 0;
    });
    const numRates = filledRates.length;
    const paymentType = numRates > 1 ? "Ratenzahlung" : "Einmalzahlung";
    const desc = String(descRow[col] ?? "").trim().replace(/^\n/, "");
    const orderId = String(orderIdRow?.[col] ?? "").trim().replace(/^\n/, "");
    const platform = detectPlatformFromDesc(desc);
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
// Datei-Parsing
// =============================================================================

function parseXlsx(buffer: ArrayBuffer): ParsedFile | string {
  try {
    const wb = XLSX.read(buffer, { type: "array" });
    const allDeals: ImportRow[] = [];
    const allNormalized: NormalizedImportRow[] = [];

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
      const parsed = parseColumnBasedRows(raw);
      if (parsed) allDeals.push(...parsed);
      allNormalized.push(...parseLegacyXlsxImport(raw));
    }
    if (allDeals.length === 0)
      return "Kein Deal erkannt. Stelle sicher, dass die Datei eine 'Preispaket'- oder 'Gesamtpaket'-Zeile enthält.";
    return { format: "column", importRows: allDeals, normalized: allNormalized };
  } catch {
    return "Datei konnte nicht gelesen werden.";
  }
}

function parseCsvText(text: string): ParsedFile | string {
  const firstLine = text.split("\n")[0] ?? "";
  const delimiter = firstLine.includes(";") ? ";" : ",";
  const headers = parseLine(firstLine, delimiter);

  const platform = detectPlatformFormat(headers, delimiter);

  if (platform === "copecart") {
    const normalized = parseCopecartExport(text);
    if (normalized.length === 0) return "Keine Transaktionen in der Copecart-Datei gefunden.";
    return { format: "copecart", importRows: [], normalized };
  }
  if (platform === "digistore") {
    const normalized = parseDigistoreExport(text);
    if (normalized.length === 0) return "Keine Transaktionen in der Digistore-Datei gefunden.";
    return { format: "digistore", importRows: [], normalized };
  }
  if (platform === "ablefy") {
    const normalized = parseAblefyExport(text);
    if (normalized.length === 0) return "Keine Transaktionen in der Ablefy-Datei gefunden.";
    return { format: "ablefy", importRows: [], normalized };
  }

  // Spalten-Format oder Standard-CSV
  const rawRows = text
    .split("\n")
    .map((line) => line.split(delimiter).map((cell) => cell.replace(/^"|"$/g, "").trim()));
  const colParsed = parseColumnBasedRows(rawRows);
  if (colParsed) {
    return { format: "column", importRows: colParsed, normalized: parseLegacyXlsxImport(rawRows) };
  }

  const importRows = rawRows
    .slice(1)
    .filter((r) => r.some((c) => c.trim()))
    .map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = r[i] ?? ""; });
      return mapStandardRow(obj);
    })
    .filter((r) => r.customer_name);

  if (importRows.length === 0) return "Keine Deals gefunden. Prüfe ob die Datei das richtige Format hat.";
  return { format: "standard", importRows, normalized: [] };
}

// =============================================================================
// UI-Hilfsfunktionen
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

const CLASSIFICATION_COLOR: Record<PreviewClassification, string> = {
  safe: "border-l-emerald-500 bg-emerald-500/5",
  warning: "border-l-amber-500 bg-amber-500/5",
  conflict: "border-l-orange-500 bg-orange-500/5",
  error: "border-l-red-500 bg-red-500/5",
};

const CLASSIFICATION_BADGE: Record<PreviewClassification, string> = {
  safe: "bg-emerald-500/15 text-emerald-400",
  warning: "bg-amber-500/15 text-amber-400",
  conflict: "bg-orange-500/15 text-orange-400",
  error: "bg-red-500/15 text-red-400",
};

const CLASSIFICATION_LABEL: Record<PreviewClassification, string> = {
  safe: "Sicher",
  warning: "Warnung",
  conflict: "Konflikt",
  error: "Fehler",
};

// =============================================================================
// Preview-Tabelle
// =============================================================================

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 85 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  );
}

function PreviewRow({ item }: { item: PreviewItem }) {
  const [expanded, setExpanded] = useState(false);
  const n = item.normalized;
  const hasDetails =
    item.warnings.length > 0 ||
    item.conflicts.length > 0 ||
    item.oldValues !== null ||
    Object.keys(item.newValues).length > 0;

  return (
    <div
      className={cn(
        "border-l-2 rounded-r-md px-3 py-2 text-xs transition-colors",
        CLASSIFICATION_COLOR[item.classification],
      )}
    >
      <div className="flex items-start gap-3 flex-wrap">
        {/* Badge */}
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0",
            CLASSIFICATION_BADGE[item.classification],
          )}
        >
          {CLASSIFICATION_LABEL[item.classification]}
        </span>

        {/* Kunde + Bestell-ID */}
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{n.customerName}</p>
          <p className="text-muted-foreground font-mono text-[10px]">{n.externalOrderId}</p>
        </div>

        {/* Aktion */}
        <div className="flex-[2] min-w-0">
          <p className="font-medium">{item.actionLabel}</p>
          <p className="text-muted-foreground">{item.reason}</p>
        </div>

        {/* Confidence */}
        <div className="shrink-0">
          <ConfidenceBar value={item.confidence} />
        </div>

        {/* Details-Toggle */}
        {hasDetails && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {/* Erweiterte Details */}
      {expanded && (
        <div className="mt-2 space-y-1.5 pl-2 border-l border-border">
          {item.conflicts.length > 0 && (
            <div>
              <p className="text-orange-400 font-medium mb-0.5">Konflikte</p>
              {item.conflicts.map((c, i) => (
                <p key={i} className="text-orange-400/80">• {c}</p>
              ))}
            </div>
          )}
          {item.warnings.length > 0 && (
            <div>
              <p className="text-amber-400 font-medium mb-0.5">Warnungen</p>
              {item.warnings.map((w, i) => (
                <p key={i} className="text-amber-400/80">• {w}</p>
              ))}
            </div>
          )}
          {item.oldValues !== null && (
            <div>
              <p className="text-muted-foreground font-medium mb-0.5">Alter Zustand (DB)</p>
              <pre className="text-[10px] text-muted-foreground/70 whitespace-pre-wrap">
                {JSON.stringify(item.oldValues, null, 2)}
              </pre>
            </div>
          )}
          {Object.keys(item.newValues).length > 0 && (
            <div>
              <p className="text-foreground font-medium mb-0.5">Neue Werte</p>
              <pre className="text-[10px] text-foreground/70 whitespace-pre-wrap">
                {JSON.stringify(item.newValues, null, 2)}
              </pre>
            </div>
          )}
          {/* Plattform-Felder */}
          <div className="flex flex-wrap gap-3 text-muted-foreground/60 text-[10px] pt-1">
            {n.externalTransactionId && <span>TRX: {n.externalTransactionId}</span>}
            {n.installmentSequence && <span>Rate: {n.installmentSequence}</span>}
            {n.planType !== "unknown" && <span>Plan: {n.planType}</span>}
            {n.amount > 0 && (
              <span>Betrag: {new Intl.NumberFormat("de-DE", { style: "currency", currency: n.currency }).format(n.amount)}</span>
            )}
            <span>Datum: {n.eventDate}</span>
            <span>Quelle: Zeile {n.rowNumber}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewSummary({ items }: { items: PreviewItem[] }) {
  const counts = {
    safe: items.filter((i) => i.classification === "safe").length,
    warning: items.filter((i) => i.classification === "warning").length,
    conflict: items.filter((i) => i.classification === "conflict").length,
    error: items.filter((i) => i.classification === "error").length,
  };
  return (
    <div className="flex gap-3 text-sm flex-wrap">
      {counts.safe > 0 && (
        <span className="flex items-center gap-1 text-emerald-400">
          <CheckCircle className="h-3.5 w-3.5" />
          {counts.safe} sicher
        </span>
      )}
      {counts.warning > 0 && (
        <span className="flex items-center gap-1 text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          {counts.warning} Warnung{counts.warning !== 1 ? "en" : ""}
        </span>
      )}
      {counts.conflict > 0 && (
        <span className="flex items-center gap-1 text-orange-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          {counts.conflict} Konflikt{counts.conflict !== 1 ? "e" : ""}
        </span>
      )}
      {counts.error > 0 && (
        <span className="flex items-center gap-1 text-red-400">
          <X className="h-3.5 w-3.5" />
          {counts.error} Fehler
        </span>
      )}
    </div>
  );
}

// =============================================================================
// Haupt-Komponente
// =============================================================================

type WizardStep = "upload" | "preview" | "done";

export function ImportWizard() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<WizardStep>("upload");
  const [fileEntries, setFileEntries] = useState<FileEntry[]>([]);
  const [parseErrors, setParseErrors] = useState<{ name: string; msg: string }[]>([]);
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
  const [executeResult, setExecuteResult] = useState<ExecuteResult | null>(null);
  const [directImportResults, setDirectImportResults] = useState<
    { name: string; result: ImportResult }[]
  >([]);
  const [defaultDate, setDefaultDate] = useState(new Date().toISOString().slice(0, 10));
  const [expandedFilter, setExpandedFilter] = useState<PreviewClassification | "all">("all");

  const [previewPending, startPreviewTransition] = useTransition();
  const [importPending, startImportTransition] = useTransition();

  const hasFiles = fileEntries.length > 0;
  const hasDone = step === "done";
  const fmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

  function applyDefaultDate(rows: ImportRow[], date: string): ImportRow[] {
    return rows.map((r) => ({ ...r, close_date: r.close_date || date }));
  }

  function withDefaultDate(parsed: ParsedFile, date: string): ParsedFile {
    if (parsed.format === "column" || parsed.format === "standard") {
      return { ...parsed, importRows: applyDefaultDate(parsed.importRows, date) };
    }
    return parsed;
  }

  function processFile(
    file: File,
  ): Promise<{ entry: FileEntry | null; error: { name: string; msg: string } | null }> {
    return new Promise((resolve) => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext === "xlsx" || ext === "xls") {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = parseXlsx(e.target!.result as ArrayBuffer);
          if (typeof result === "string") {
            resolve({ entry: null, error: { name: file.name, msg: result } });
          } else {
            resolve({ entry: { name: file.name, parsed: withDefaultDate(result, defaultDate) }, error: null });
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
            resolve({ entry: { name: file.name, parsed: withDefaultDate(result, defaultDate) }, error: null });
          }
        };
        reader.readAsText(file, "utf-8");
      } else {
        resolve({
          entry: null,
          error: { name: file.name, msg: "Nur CSV oder Excel-Dateien (.xlsx) werden unterstützt." },
        });
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

  function handleDateChange(date: string) {
    setDefaultDate(date);
    setFileEntries((prev) =>
      prev.map((entry) => ({
        ...entry,
        parsed: withDefaultDate(entry.parsed, date),
      })),
    );
  }

  // ── Vorschau laden ──────────────────────────────────────────────────────────
  function handleLoadPreview() {
    const allNormalized = fileEntries.flatMap((e) => e.parsed.normalized);
    if (allNormalized.length === 0) return;

    startPreviewTransition(async () => {
      const items = await previewImport(allNormalized);
      setPreviewItems(items);
      setStep("preview");
    });
  }

  // ── Importieren bestätigen ──────────────────────────────────────────────────
  function handleConfirmImport() {
    startImportTransition(async () => {
      // 1. Normalized path: alle PreviewItems via executeImport
      const exResult = previewItems.length > 0
        ? await executeImport(previewItems)
        : null;

      // 2. Standard-CSV-Dateien ohne normalized rows → direkter importDeals Pfad
      const standardEntries = fileEntries.filter(
        (e) => e.parsed.format === "standard" && e.parsed.importRows.length > 0,
      );
      const directResults: { name: string; result: ImportResult }[] = [];
      for (const entry of standardEntries) {
        const res = await importDeals(entry.parsed.importRows);
        directResults.push({ name: entry.name, result: res });
      }

      setExecuteResult(exResult);
      setDirectImportResults(directResults);
      setStep("done");
      setFileEntries([]);
    });
  }

  function fullReset() {
    setFileEntries([]);
    setParseErrors([]);
    setPreviewItems([]);
    setExecuteResult(null);
    setDirectImportResults([]);
    setStep("upload");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── Gefilterte Preview-Items ────────────────────────────────────────────────
  const filteredItems =
    expandedFilter === "all"
      ? previewItems
      : previewItems.filter((i) => i.classification === expandedFilter);

  const blockingErrors = previewItems.filter(
    (i) => i.classification === "error",
  ).length;

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="space-y-6">

      {/* ── Info-Box ─────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-3">
        <p className="text-sm font-medium">Unterstützte Formate — alles in einem Import</p>
        <div className="grid sm:grid-cols-2 gap-3 text-sm text-muted-foreground">
          <div className="space-y-1">
            <p className="font-medium text-foreground">📊 Excel / CSV (eigene Tabelle)</p>
            <p>
              Deine Buchhaltungs-Tabelle (Kalaie-Format) oder Standard-CSV.
              Bestehende Deals werden per Bestell-ID geupdated, neue angelegt.
            </p>
            <button
              onClick={downloadTemplate}
              className="text-xs text-foreground underline underline-offset-4 hover:no-underline mt-1"
            >
              Vorlage herunterladen
            </button>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-foreground">💳 Platform-Exports</p>
            <p>CSV-Export von Copecart, Digistore oder Ablefy — mehrere Dateien gleichzeitig möglich.</p>
            <div className="flex gap-1.5 mt-1 flex-wrap">
              {["Copecart", "Digistore", "Ablefy"].map((p) => (
                <span key={p} className="rounded-full border border-border px-2 py-0.5 text-xs">
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Schritt 1: Upload ────────────────────────────────────────────── */}
      {step === "upload" && (
        <>
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
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    <span className="font-medium">{err.name}:</span> {err.msg}
                  </span>
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
                const isOwn =
                  entry.parsed.format === "column" || entry.parsed.format === "standard";
                const { importRows, normalized } = entry.parsed;

                const rowCount = isOwn ? importRows.length : normalized.length;
                const paidCount = isOwn ? 0 : normalized.filter((r) => r.eventType === "payment_paid").length;
                const refundCount = normalized.filter((r) => r.eventType === "refund").length;
                const failedCount = normalized.filter(
                  (r) => r.eventType === "payment_failed" || r.eventType === "chargeback",
                ).length;

                return (
                  <div key={entry.name} className="rounded-lg border border-border overflow-hidden">
                    {/* Datei-Header */}
                    <div className="flex items-center justify-between px-3 py-2 bg-muted/20 border-b border-border">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium">{entry.name}</span>
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", FORMAT_COLOR[entry.parsed.format])}>
                          {FORMAT_LABEL[entry.parsed.format]}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {isOwn
                            ? `${rowCount} Deals`
                            : [
                                `${rowCount} Transaktionen`,
                                `${paidCount} bezahlt`,
                                ...(refundCount > 0 ? [`${refundCount} erstattet`] : []),
                                ...(failedCount > 0 ? [`${failedCount} fehlgeschlagen`] : []),
                              ].join(" · ")}
                        </span>
                      </div>
                      <button onClick={() => removeEntry(entry.name)} className="text-muted-foreground hover:text-foreground shrink-0">
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Preview-Tabelle */}
                    <div className="overflow-auto max-h-48">
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
                            {importRows.slice(0, 15).map((r, i) => (
                              <tr key={i} className={cn(!r.customer_name && "opacity-50 bg-destructive/5")}>
                                <td className="px-3 py-1.5 font-medium whitespace-nowrap">{r.customer_name || "—"}</td>
                                <td className="px-3 py-1.5 font-mono text-muted-foreground whitespace-nowrap">{r.order_id || "—"}</td>
                                <td className="px-3 py-1.5 tabular-nums whitespace-nowrap">{r.total_price ? fmt.format(Number(r.total_price)) : "—"}</td>
                                <td className="px-3 py-1.5 whitespace-nowrap">{r.payment_type || "—"}</td>
                                <td className="px-3 py-1.5 text-center">{r.number_of_rates || (r.payment_type?.toLowerCase().includes("einmal") ? "1" : "—")}</td>
                                <td className="px-3 py-1.5 whitespace-nowrap">{r.bezahlt_raten || "—"}</td>
                                <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{r.close_date || "—"}</td>
                                <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{r.platform_name || "—"}</td>
                              </tr>
                            ))}
                            {importRows.length > 15 && (
                              <tr><td colSpan={8} className="px-3 py-2 text-center text-muted-foreground">+ {importRows.length - 15} weitere…</td></tr>
                            )}
                          </tbody>
                        </table>
                      ) : (
                        <table className="w-full text-xs">
                          <thead className="border-b border-border bg-muted/20 sticky top-0">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Bestell-ID</th>
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Kunde</th>
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Betrag</th>
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Event</th>
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Rate</th>
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Warnungen</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {normalized.slice(0, 15).map((r, i) => (
                              <tr key={i} className={cn(r.eventType !== "payment_paid" && "opacity-40")}>
                                <td className="px-3 py-1.5 font-mono text-muted-foreground text-[10px]">{r.externalOrderId}</td>
                                <td className="px-3 py-1.5 whitespace-nowrap">{r.customerName}</td>
                                <td className="px-3 py-1.5 tabular-nums whitespace-nowrap">
                                  {r.amount > 0 ? fmt.format(r.amount) : "—"}
                                </td>
                                <td className="px-3 py-1.5">
                                  <span className={cn(
                                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                                    r.eventType === "payment_paid" ? "bg-emerald-500/15 text-emerald-400"
                                      : r.eventType === "refund" ? "bg-amber-500/15 text-amber-400"
                                      : "bg-muted text-muted-foreground",
                                  )}>
                                    {r.eventType === "payment_paid" ? "Bezahlt"
                                      : r.eventType === "payment_pending" ? "Ausstehend"
                                      : r.eventType === "refund" ? "Erstattung"
                                      : r.eventType === "payment_failed" ? "Fehlgeschlagen"
                                      : r.eventType === "chargeback" ? "Rückbuchung"
                                      : r.eventType}
                                  </span>
                                </td>
                                <td className="px-3 py-1.5 text-muted-foreground">
                                  {r.installmentSequence ? `Rate ${r.installmentSequence}` : "—"}
                                </td>
                                <td className="px-3 py-1.5 text-amber-400/70 text-[10px]">
                                  {r.warnings.length > 0 ? `${r.warnings.length} ⚠` : ""}
                                </td>
                              </tr>
                            ))}
                            {normalized.length > 15 && (
                              <tr><td colSpan={6} className="px-3 py-2 text-center text-muted-foreground">+ {normalized.length - 15} weitere…</td></tr>
                            )}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Vorschau laden */}
              <div className="flex gap-3 pt-1">
                <Button
                  onClick={handleLoadPreview}
                  disabled={previewPending || fileEntries.every((e) => e.parsed.normalized.length === 0)}
                >
                  <Eye className="h-4 w-4 mr-1.5" />
                  {previewPending ? "Vorschau wird geladen…" : "Vorschau laden"}
                </Button>
                <Button variant="outline" onClick={fullReset}>
                  Abbrechen
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Schritt 2: Preview ───────────────────────────────────────────── */}
      {step === "preview" && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold">Import-Vorschau</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {previewItems.length} Einträge analysiert — noch kein Schreiben in die Datenbank.
              </p>
              <div className="mt-2">
                <PreviewSummary items={previewItems} />
              </div>
            </div>
            <button onClick={fullReset} className="text-muted-foreground hover:text-foreground shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Blockierende Fehler */}
          {blockingErrors > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                <span className="font-medium">{blockingErrors} Fehler</span> müssen vor dem Import manuell geklärt werden.
              </p>
            </div>
          )}

          {/* Hinweis: Digistore-Snapshot */}
          {previewItems.some((i) => i.normalized.source === "digistore") && (
            <div className="flex items-start gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-400">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <p>
                Digistore-Exporte sind Order-Snapshots, keine Transaktionslisten. Einzelne Raten
                werden nur markiert wenn der Status eindeutig ist.
              </p>
            </div>
          )}

          {/* Filter-Tabs */}
          <div className="flex gap-1 flex-wrap">
            {(["all", "safe", "warning", "conflict", "error"] as const).map((f) => {
              const count =
                f === "all" ? previewItems.length : previewItems.filter((i) => i.classification === f).length;
              if (f !== "all" && count === 0) return null;
              return (
                <button
                  key={f}
                  onClick={() => setExpandedFilter(f)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    expandedFilter === f
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f === "all" ? "Alle" : CLASSIFICATION_LABEL[f]} ({count})
                </button>
              );
            })}
          </div>

          {/* Preview-Items */}
          <div className="space-y-1.5 max-h-[480px] overflow-y-auto pr-1">
            {filteredItems.map((item) => (
              <PreviewRow key={item.syntheticKey} item={item} />
            ))}
            {filteredItems.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                Keine Einträge für diesen Filter.
              </p>
            )}
          </div>

          {/* Aktions-Buttons */}
          <div className="flex gap-3 pt-2 flex-wrap">
            <Button
              onClick={handleConfirmImport}
              disabled={importPending || blockingErrors > 0}
            >
              {importPending
                ? "Wird importiert…"
                : blockingErrors > 0
                ? `Import blockiert (${blockingErrors} Fehler)`
                : `${previewItems.filter((i) => i.classification !== "error").length} Einträge importieren`}
            </Button>
            <Button variant="outline" onClick={() => setStep("upload")}>
              ← Zurück zur Dateiauswahl
            </Button>
            <Button variant="outline" onClick={fullReset}>
              Abbrechen
            </Button>
          </div>
        </div>
      )}

      {/* ── Schritt 3: Ergebnisse ────────────────────────────────────────── */}
      {step === "done" && (executeResult !== null || directImportResults.length > 0) && (
        <div className="space-y-4">

          {/* Plattform-Import-Ergebnis (executeImport) */}
          {executeResult !== null && (() => {
            const hasErrors = executeResult.errors.length > 0;
            const hasReview = executeResult.reviewNeeded > 0;
            const allGood = !hasErrors && !hasReview;
            return (
              <div
                className={cn(
                  "rounded-lg border p-4 space-y-3",
                  hasErrors
                    ? "border-rose-500/40 bg-rose-500/10"
                    : hasReview
                    ? "border-amber-500/40 bg-amber-500/10"
                    : "border-emerald-500/40 bg-emerald-500/10",
                )}
              >
                <div className="flex items-center gap-2">
                  {hasErrors
                    ? <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
                    : hasReview
                    ? <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                    : <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />}
                  <span className="text-sm font-semibold">Plattform-Import abgeschlossen</span>
                </div>

                {/* Statistik-Zeile */}
                <p className="text-sm font-medium">
                  {(() => {
                    const parts: string[] = [];
                    if (executeResult.created > 0) parts.push(`${executeResult.created} Deal(s) angelegt`);
                    if (executeResult.paid > 0) parts.push(`${executeResult.paid} Zahlung(en) markiert`);
                    if (executeResult.installmentsCreated > 0) parts.push(`${executeResult.installmentsCreated} Rate(n) angelegt`);
                    if (executeResult.skipped > 0) parts.push(`${executeResult.skipped} übersprungen`);
                    if (executeResult.reviewNeeded > 0) parts.push(`${executeResult.reviewNeeded} zur Prüfung`);
                    return parts.length > 0 ? parts.join(" · ") : "Keine Änderungen.";
                  })()}
                </p>

                {/* Deal-Link wenn neue Deals angelegt */}
                {executeResult.created > 0 && (
                  <div className="flex items-start gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2">
                    <PlusCircle className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-400">
                      {executeResult.created} Deal(s) automatisch angelegt — bitte kurz prüfen.{" "}
                      <Link href="/deals" className="underline underline-offset-2 hover:text-blue-300">
                        Zu den Deals →
                      </Link>
                    </p>
                  </div>
                )}

                {/* Review-Items */}
                {executeResult.reviewItems.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-amber-400">Manuelle Prüfung erforderlich:</p>
                    <ul className="space-y-0.5 text-xs text-amber-400/80">
                      {executeResult.reviewItems.slice(0, 8).map((item, j) => (
                        <li key={j}>• {item}</li>
                      ))}
                      {executeResult.reviewItems.length > 8 && (
                        <li>+ {executeResult.reviewItems.length - 8} weitere…</li>
                      )}
                    </ul>
                  </div>
                )}

                {/* Fehler */}
                {executeResult.errors.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-rose-400">Fehler:</p>
                    <ul className="space-y-0.5 text-xs text-rose-400/80">
                      {executeResult.errors.slice(0, 5).map((e, j) => (
                        <li key={j}>• {e}</li>
                      ))}
                      {executeResult.errors.length > 5 && (
                        <li>+ {executeResult.errors.length - 5} weitere…</li>
                      )}
                    </ul>
                  </div>
                )}

                {allGood && (
                  <p className="text-xs text-emerald-400/70">Alle Einträge erfolgreich verarbeitet.</p>
                )}
              </div>
            );
          })()}

          {/* Standard-CSV-Ergebnisse (importDeals) */}
          {directImportResults.map((res, i) => {
            const ir = res.result as ImportResult;
            const hasError = ir.errors.length > 0;
            return (
              <div
                key={i}
                className={cn(
                  "rounded-lg border p-4 space-y-2",
                  hasError
                    ? "border-amber-500/40 bg-amber-500/10"
                    : "border-emerald-500/40 bg-emerald-500/10",
                )}
              >
                <div className="flex items-center gap-2">
                  {hasError
                    ? <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                    : <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />}
                  <span className="text-sm font-medium text-muted-foreground truncate">
                    {res.name}
                  </span>
                </div>
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
                {ir.errors.length > 0 && (
                  <ul className="space-y-1 text-xs text-amber-400">
                    {ir.errors.slice(0, 5).map((e, j) => <li key={j}>• {e}</li>)}
                    {ir.errors.length > 5 && <li>+ {ir.errors.length - 5} weitere…</li>}
                  </ul>
                )}
              </div>
            );
          })}

          <Button variant="outline" onClick={fullReset}>
            Weiteren Import starten
          </Button>
        </div>
      )}
    </div>
  );
}

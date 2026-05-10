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

// =============================================================================
// Platform-Export Parser (Copecart / Digistore / Ablefy)
// =============================================================================

function detectPlatformFormat(headers: string[]): "copecart" | "digistore" | "ablefy" | null {
  const h = headers.map((x) => x.toLowerCase().trim());
  if (h.some((x) => x === "transaktionsstatus")) return "copecart";
  if (h.some((x) => x.startsWith("zahlungsnr"))) return "digistore";
  if (h.some((x) => x === "zahlungsplan")) return "ablefy";
  return null;
}

function parseCopecart(text: string): AbgleichRow[] {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseLine(lines[0], ",");
  const idxId = headers.findIndex((h) => h.toLowerCase() === "bestell-id");
  const idxStatus = headers.findIndex((h) => h.toLowerCase() === "transaktionsstatus");
  if (idxId < 0 || idxStatus < 0) return [];
  return lines.slice(1).flatMap((line) => {
    const cols = parseLine(line, ",");
    const orderId = cols[idxId];
    if (!orderId) return [];
    const status = (cols[idxStatus] ?? "").toLowerCase();
    return [{
      order_id: orderId,
      platform: "copecart" as const,
      status: status.includes("bezahlt") ? "paid" : status.includes("erstattet") ? "refunded" : "failed",
    }];
  });
}

function parseDigistore(text: string): AbgleichRow[] {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseLine(lines[0], ";");
  const idxId = headers.findIndex((h) => h.toLowerCase() === "bestell-id");
  const idxNr = headers.findIndex((h) => h.toLowerCase().startsWith("zahlungsnr"));
  const idxType = headers.findIndex((h) => h.toLowerCase() === "transaktionstyp");
  if (idxId < 0) return [];
  return lines.slice(1).flatMap((line) => {
    const cols = parseLine(line, ";");
    const orderId = cols[idxId];
    if (!orderId) return [];
    const txType = (cols[idxType] ?? "").toLowerCase();
    if (txType && !txType.includes("zahlung")) return [];
    const nr = idxNr >= 0 ? parseInt(cols[idxNr] ?? "1", 10) : undefined;
    return [{ order_id: orderId, platform: "digistore" as const, status: "paid" as const, installment_sequence: nr && !isNaN(nr) ? nr : undefined }];
  });
}

function parseAblefy(text: string): AbgleichRow[] {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseLine(lines[0], ";");
  const norm = (s: string) => s.toLowerCase().trim();
  const idxId = headers.findIndex((h) => norm(h).replace(/[- ]/g, "") === "bestellid");
  const idxStatus = headers.findIndex((h) => norm(h) === "status");
  const idxFaellig = headers.findIndex((h) => { const l = norm(h); return l.includes("faelligkeiten") || l.includes("fälligkeiten"); });
  if (idxId < 0) return [];
  const seqMap = new Map<string, number>();
  return lines.slice(1).flatMap((line) => {
    const cols = parseLine(line, ";");
    const orderId = cols[idxId];
    if (!orderId) return [];
    const status = norm(cols[idxStatus] ?? "");
    const isPaid = status.includes("erfolgreich");
    const isFailed = status.includes("abgelaufen") || status.includes("failed");
    const seq = (seqMap.get(orderId) ?? 0) + 1;
    seqMap.set(orderId, seq);
    return [{ order_id: orderId, platform: "ablefy" as const, status: isFailed ? "failed" : isPaid ? "paid" : "failed", installment_sequence: idxFaellig >= 0 ? seq : undefined }];
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
  const platform = detectPlatformFormat(headers);
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
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [abgleichResult, setAbgleichResult] = useState<AbgleichResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [defaultDate, setDefaultDate] = useState(new Date().toISOString().slice(0, 10));

  const isOwnFormat = parsedFile?.format === "column" || parsedFile?.format === "standard";
  const isPlatformFormat = parsedFile?.format === "copecart" || parsedFile?.format === "digistore" || parsedFile?.format === "ablefy";

  function applyDefaultDate(rows: ImportRow[], date: string): ImportRow[] {
    return rows.map((r) => ({ ...r, close_date: r.close_date || date }));
  }

  function handleFile(file: File) {
    resetState();
    setFileName(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = parseXlsx(e.target!.result as ArrayBuffer);
        if (typeof result === "string") { setParseError(result); return; }
        if (result.format === "column") {
          setParsedFile({ format: result.format, rows: applyDefaultDate(result.rows as ImportRow[], defaultDate) });
        } else {
          setParsedFile(result);
        }
      };
      reader.readAsArrayBuffer(file);
    } else if (ext === "csv") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = parseCsvText(e.target!.result as string);
        if (typeof result === "string") { setParseError(result); return; }
        if (result.format === "column") {
          setParsedFile({ format: result.format, rows: applyDefaultDate(result.rows as ImportRow[], defaultDate) });
        } else {
          setParsedFile(result);
        }
      };
      reader.readAsText(file, "utf-8");
    } else {
      setParseError("Nur CSV oder Excel-Dateien (.xlsx) werden unterstützt.");
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleImport() {
    if (!parsedFile) return;
    startTransition(async () => {
      if (isOwnFormat) {
        const rows = parsedFile.rows as ImportRow[];
        const res = await importDeals(rows);
        setImportResult(res);
        if (res.imported + res.updated > 0) setParsedFile(null);
      } else if (isPlatformFormat) {
        const rows = parsedFile.rows as AbgleichRow[];
        const res = await processPaymentExport(rows);
        setAbgleichResult(res);
        if (res.updated > 0) setParsedFile(null);
      }
    });
  }

  function resetState() {
    setParsedFile(null);
    setParseError("");
    setImportResult(null);
    setAbgleichResult(null);
  }

  function fullReset() {
    resetState();
    setFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleDateChange(date: string) {
    setDefaultDate(date);
    if (parsedFile?.format === "column") {
      setParsedFile({
        format: "column",
        rows: applyDefaultDate(parsedFile.rows as ImportRow[], date),
      });
    }
  }

  const ownRows = isOwnFormat ? (parsedFile!.rows as ImportRow[]) : [];
  const platformRows = isPlatformFormat ? (parsedFile!.rows as AbgleichRow[]) : [];
  const paidPlatformRows = platformRows.filter((r) => r.status === "paid");
  const skippedPlatformRows = platformRows.filter((r) => r.status !== "paid");

  return (
    <div className="space-y-6">
      {/* Info */}
      <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-3">
        <p className="text-sm font-medium">Unterstützte Formate — alles in einem Import</p>
        <div className="grid sm:grid-cols-2 gap-3 text-sm text-muted-foreground">
          <div className="space-y-1">
            <p className="font-medium text-foreground">📊 Excel / CSV (eigene Tabelle)</p>
            <p>Deine Buchhaltungs-Tabelle (Kalaie-Format) oder Standard-CSV. Bestehende Deals werden automatisch aktualisiert, neue angelegt.</p>
            <button onClick={downloadTemplate} className="text-xs text-foreground underline underline-offset-4 hover:no-underline mt-1">
              Vorlage herunterladen
            </button>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-foreground">💳 Platform-Exports</p>
            <p>CSV-Export von Copecart, Digistore oder Ablefy — Zahlungsstatus wird automatisch abgeglichen.</p>
            <div className="flex gap-1.5 mt-1 flex-wrap">
              {["Copecart", "Digistore", "Ablefy"].map((p) => (
                <span key={p} className="rounded-full border border-border px-2 py-0.5 text-xs">{p}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Drop zone */}
      {!parsedFile && !importResult && !abgleichResult && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          className="rounded-lg border-2 border-dashed border-border bg-muted/10 px-8 py-12 text-center space-y-4 transition-colors hover:border-border/80 cursor-pointer"
        >
          <div className="flex justify-center">
            <div className="rounded-full bg-muted p-4">
              <Upload className="h-8 w-8 text-muted-foreground" />
            </div>
          </div>
          <div>
            <p className="font-medium">Excel (.xlsx) oder CSV hochladen</p>
            <p className="text-sm text-muted-foreground mt-1">
              Klicken oder Datei hier ablegen — Format wird automatisch erkannt
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>
      )}

      {parseError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          {parseError}
        </div>
      )}

      {/* Format Badge + Date Picker */}
      {parsedFile && (
        <div className="flex flex-wrap items-center gap-3">
          <span className={cn(
            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
            FORMAT_COLOR[parsedFile.format],
          )}>
            {FORMAT_LABEL[parsedFile.format]} erkannt
          </span>

          {parsedFile.format === "column" && (
            <div className="flex items-center gap-2 text-sm">
              <Label htmlFor="default_date" className="text-muted-foreground whitespace-nowrap">
                Abschlussdatum (Standard):
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
        </div>
      )}

      {/* Preview — eigene Datei */}
      {parsedFile && isOwnFormat && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{fileName}</span>
              <span className="text-sm text-muted-foreground">
                — {ownRows.length} {ownRows.length === 1 ? "Deal" : "Deals"} erkannt
              </span>
            </div>
            <button onClick={fullReset} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="rounded-lg border border-border overflow-auto max-h-72">
            <table className="w-full text-xs">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  {["Kunde", "Bestell-ID", "Preis", "Zahlungsart", "Raten", "Bezahlt", "Abschluss", "Plattform"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ownRows.slice(0, 15).map((r, i) => (
                  <tr key={i} className={cn(!r.customer_name && "opacity-50 bg-destructive/5")}>
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{r.customer_name || "—"}</td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground whitespace-nowrap">{r.order_id || "—"}</td>
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                      {r.total_price ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(r.total_price)) : "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.payment_type || "—"}</td>
                    <td className="px-3 py-2 text-center">{r.number_of_rates || (r.payment_type?.toLowerCase().includes("einmal") ? "1" : "—")}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.bezahlt_raten || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{r.close_date || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{r.platform_name || "—"}</td>
                  </tr>
                ))}
                {ownRows.length > 15 && (
                  <tr><td colSpan={8} className="px-3 py-2 text-center text-muted-foreground">+ {ownRows.length - 15} weitere…</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleImport} disabled={pending}>
              {pending ? `Importiere ${ownRows.length} Deals…` : `${ownRows.length} Deals importieren / aktualisieren`}
            </Button>
            <Button variant="outline" onClick={fullReset}>Abbrechen</Button>
          </div>
        </div>
      )}

      {/* Preview — Platform Export */}
      {parsedFile && isPlatformFormat && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{fileName}</span>
              <span className="text-sm text-muted-foreground">
                {platformRows.length} Transaktionen —{" "}
                <span className="text-emerald-400 font-medium">{paidPlatformRows.length} bezahlt</span>
                {skippedPlatformRows.length > 0 && <>, {skippedPlatformRows.length} übersprungen</>}
              </span>
            </div>
            <button onClick={fullReset} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="rounded-lg border border-border overflow-auto max-h-72">
            <table className="w-full text-xs">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Bestell-ID</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {platformRows.slice(0, 20).map((r, i) => (
                  <tr key={i} className={cn(r.status !== "paid" && "opacity-40")}>
                    <td className="px-3 py-2 font-mono">{r.order_id}</td>
                    <td className="px-3 py-2">
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        r.status === "paid" ? "bg-emerald-500/15 text-emerald-400"
                          : r.status === "refunded" ? "bg-amber-500/15 text-amber-400"
                          : "bg-muted text-muted-foreground",
                      )}>
                        {r.status === "paid" ? "Bezahlt" : r.status === "refunded" ? "Erstattet" : "Übersprungen"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.installment_sequence ? `Rate ${r.installment_sequence}` : "—"}</td>
                  </tr>
                ))}
                {platformRows.length > 20 && (
                  <tr><td colSpan={3} className="px-3 py-2 text-center text-muted-foreground">+ {platformRows.length - 20} weitere…</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleImport} disabled={pending || paidPlatformRows.length === 0}>
              {pending ? "Wird abgeglichen…" : `${paidPlatformRows.length} Zahlungen abgleichen`}
            </Button>
            <Button variant="outline" onClick={fullReset}>Abbrechen</Button>
          </div>
        </div>
      )}

      {/* Ergebnis — eigener Import */}
      {importResult && (
        <div className="space-y-3">
          <div className={cn(
            "rounded-lg border p-4 space-y-2",
            importResult.errors.length === 0
              ? "border-emerald-500/40 bg-emerald-500/10"
              : "border-amber-500/40 bg-amber-500/10",
          )}>
            <div className="flex items-center gap-2">
              {importResult.errors.length === 0
                ? <CheckCircle className="h-4 w-4 text-emerald-400" />
                : <AlertTriangle className="h-4 w-4 text-amber-400" />}
              <span className="text-sm font-medium">
                {importResult.imported > 0 && `${importResult.imported} neu angelegt`}
                {importResult.imported > 0 && (importResult.updated > 0 || importResult.skipped > 0) && " · "}
                {importResult.updated > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <RefreshCw className="h-3 w-3" />
                    {importResult.updated} aktualisiert
                  </span>
                )}
                {importResult.skipped > 0 && ` · ${importResult.skipped} übersprungen`}
              </span>
            </div>
            {importResult.errors.length > 0 && (
              <ul className="space-y-1 text-xs text-amber-400">
                {importResult.errors.slice(0, 10).map((e, i) => <li key={i}>• {e}</li>)}
                {importResult.errors.length > 10 && <li>+ {importResult.errors.length - 10} weitere…</li>}
              </ul>
            )}
          </div>
          <Button variant="outline" onClick={fullReset}>Weiteren Import starten</Button>
        </div>
      )}

      {/* Ergebnis — Platform Abgleich */}
      {abgleichResult && (
        <div className="space-y-3">
          <div className={cn(
            "rounded-lg border p-4 space-y-3",
            abgleichResult.errors.length === 0 && abgleichResult.notFound.length === 0
              ? "border-emerald-500/40 bg-emerald-500/10"
              : "border-amber-500/40 bg-amber-500/10",
          )}>
            <div className="flex items-center gap-2">
              {abgleichResult.errors.length === 0 && abgleichResult.notFound.length === 0
                ? <CheckCircle className="h-4 w-4 text-emerald-400" />
                : <AlertTriangle className="h-4 w-4 text-amber-400" />}
              <span className="text-sm font-medium">
                {abgleichResult.updated} Zahlungen abgeglichen
                {abgleichResult.created > 0 && ` · ${abgleichResult.created} neu angelegt`}
                {abgleichResult.skipped > 0 && ` · ${abgleichResult.skipped} übersprungen`}
              </span>
            </div>
            {abgleichResult.created > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2">
                <PlusCircle className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-400">
                  {abgleichResult.created} Deal(s) wurden automatisch angelegt — Kundenname und Preis bitte manuell ergänzen.{" "}
                  <Link href="/deals" className="underline underline-offset-2 hover:text-blue-300">Zu den Deals →</Link>
                </p>
              </div>
            )}
            {abgleichResult.errors.length > 0 && (
              <ul className="space-y-1 text-xs text-rose-400">
                {abgleichResult.errors.map((e, i) => <li key={i}>• {e}</li>)}
              </ul>
            )}
          </div>
          <Button variant="outline" onClick={fullReset}>Weiteren Import starten</Button>
        </div>
      )}
    </div>
  );
}

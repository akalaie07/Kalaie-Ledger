"use client";

import { useRef, useState, useTransition } from "react";
import {
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle,
  X,
  RefreshCw,
  Download,
} from "lucide-react";
import * as XLSX from "xlsx";
import Link from "next/link";

import { importDeals, type ImportRow, type ImportResult } from "@/lib/actions/import";
import { parseLegacyXlsxImport } from "@/lib/import";
import { parseDate } from "@/lib/utils/parse";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// =============================================================================
// Template Download
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
// CSV-Parser
// =============================================================================

function parseLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let field = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === delimiter && !inQuotes) { result.push(field.trim()); field = ""; }
    else { field += ch; }
  }
  result.push(field.trim());
  return result;
}

function normLabel(val: unknown): string {
  return String(val ?? "").trim().toLowerCase().replace(/:$/, "").replace(/\s+/g, " ");
}

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
    rowByLabel.get("gesamtpaket") ?? rowByLabel.get("preispaket") ?? rowByLabel.get("gesamtpreis");
  const orderIdRow =
    rowByLabel.get("bestell-id") ?? rowByLabel.get("bestl. id") ??
    rowByLabel.get("bestell id") ?? rowByLabel.get("bestellnummer");
  const closeDateRow =
    rowByLabel.get("abschlussdatum") ?? rowByLabel.get("abschluss") ?? rowByLabel.get("datum");
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
    const desc = String(descRow[col] ?? "").trim().replace(/^\n/, "");
    const orderId = String(orderIdRow?.[col] ?? "").trim().replace(/^\n/, "");
    const rawCloseDate = closeDateRow ? String(closeDateRow[col] ?? "").trim() : "";
    deals.push({
      customer_name: name,
      order_id: orderId || undefined,
      platform_name: detectPlatformFromDesc(desc) || undefined,
      total_price: totalPrice.toString(),
      payment_type: numRates > 1 ? "Ratenzahlung" : "Einmalzahlung",
      close_date: rawCloseDate ? (parseDate(rawCloseDate) ?? "") : "",
      number_of_rates: numRates > 1 ? numRates.toString() : undefined,
      notes: desc || undefined,
    });
  }
  return deals.length > 0 ? deals : null;
}

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
// Datei-Parsing
// =============================================================================

type ParsedMigrationFile = {
  rows: ImportRow[];
  format: "column" | "standard";
};

const PLATFORM_HEADERS = ["kundenname", "trx-id", "zahlungsstatus"];

function detectPlatformFormat(headers: string[], delimiter: string): boolean {
  const h = headers.map((x) => x.toLowerCase().trim());
  return (
    (delimiter === "," && h.some((x) => x === "kundenname")) ||
    h.some((x) => x === "trx-id") ||
    h.some((x) => x === "zahlungsstatus")
  );
}

function parseXlsxMigration(buffer: ArrayBuffer): ParsedMigrationFile | string {
  try {
    const wb = XLSX.read(buffer, { type: "array" });
    const allDeals: ImportRow[] = [];
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
      const parsed = parseColumnBasedRows(raw);
      if (parsed) allDeals.push(...parsed);
    }
    if (allDeals.length === 0)
      return "Kein Deal erkannt. Stelle sicher, dass die Datei eine 'Preispaket'- oder 'Gesamtpaket'-Zeile enthält.";
    return { rows: allDeals, format: "column" };
  } catch {
    return "Datei konnte nicht gelesen werden.";
  }
}

function parseCsvMigration(text: string): ParsedMigrationFile | string {
  const firstLine = text.split("\n")[0] ?? "";
  const delimiter = firstLine.includes(";") ? ";" : ",";
  const headers = parseLine(firstLine, delimiter);

  if (detectPlatformFormat(headers, delimiter)) {
    return "Diese Datei sieht nach einem Plattform-Export (Copecart/Digistore/Ablefy) aus. Bitte den Zahlungsabgleich verwenden.";
  }

  const rawRows = text
    .split("\n")
    .map((line) => line.split(delimiter).map((cell) => cell.replace(/^"|"$/g, "").trim()));

  const colParsed = parseColumnBasedRows(rawRows);
  if (colParsed) return { rows: colParsed, format: "column" };

  const importRows = rawRows
    .slice(1)
    .filter((r) => r.some((c) => c.trim()))
    .map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = r[i] ?? ""; });
      return mapStandardRow(obj);
    })
    .filter((r) => r.customer_name);

  if (importRows.length === 0)
    return "Keine Deals gefunden. Prüfe ob die Datei das richtige Format hat.";
  return { rows: importRows, format: "standard" };
}

// =============================================================================
// Haupt-Komponente
// =============================================================================

type FileEntry = { name: string; rows: ImportRow[]; format: "column" | "standard" };
type WizardStep = "upload" | "done";

export function MigrationWizard() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<WizardStep>("upload");
  const [fileEntries, setFileEntries] = useState<FileEntry[]>([]);
  const [parseErrors, setParseErrors] = useState<{ name: string; msg: string }[]>([]);
  const [importResults, setImportResults] = useState<{ name: string; result: ImportResult }[]>([]);
  const [defaultDate, setDefaultDate] = useState(new Date().toISOString().slice(0, 10));
  const [pending, startTransition] = useTransition();

  const fmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

  function applyDate(rows: ImportRow[], date: string): ImportRow[] {
    return rows.map((r) => ({ ...r, close_date: r.close_date || date }));
  }

  function processFile(file: File): Promise<{ entry: FileEntry | null; error: { name: string; msg: string } | null }> {
    return new Promise((resolve) => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext === "xlsx" || ext === "xls") {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = parseXlsxMigration(e.target!.result as ArrayBuffer);
          if (typeof result === "string") {
            resolve({ entry: null, error: { name: file.name, msg: result } });
          } else {
            resolve({ entry: { name: file.name, rows: applyDate(result.rows, defaultDate), format: result.format }, error: null });
          }
        };
        reader.readAsArrayBuffer(file);
      } else if (ext === "csv") {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = parseCsvMigration(e.target!.result as string);
          if (typeof result === "string") {
            resolve({ entry: null, error: { name: file.name, msg: result } });
          } else {
            resolve({ entry: { name: file.name, rows: applyDate(result.rows, defaultDate), format: result.format }, error: null });
          }
        };
        reader.readAsText(file, "utf-8");
      } else {
        resolve({ entry: null, error: { name: file.name, msg: "Nur CSV oder Excel (.xlsx) werden unterstützt." } });
      }
    });
  }

  async function handleFiles(files: FileList | File[]) {
    const newEntries: FileEntry[] = [];
    const newErrors: { name: string; msg: string }[] = [];
    for (const file of Array.from(files)) {
      const { entry, error } = await processFile(file);
      if (entry) newEntries.push(entry);
      if (error) newErrors.push(error);
    }
    setFileEntries((prev) => {
      const existing = new Set(prev.map((e) => e.name));
      return [...prev, ...newEntries.filter((e) => !existing.has(e.name))];
    });
    setParseErrors((prev) => [...prev, ...newErrors]);
  }

  function handleDateChange(date: string) {
    setDefaultDate(date);
    setFileEntries((prev) => prev.map((e) => ({ ...e, rows: applyDate(e.rows, date) })));
  }

  function handleConfirm() {
    startTransition(async () => {
      const results: { name: string; result: ImportResult }[] = [];
      for (const entry of fileEntries) {
        const result = await importDeals(entry.rows);
        results.push({ name: entry.name, result });
      }
      setImportResults(results);
      setStep("done");
    });
  }

  function fullReset() {
    setFileEntries([]);
    setParseErrors([]);
    setImportResults([]);
    setStep("upload");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="space-y-6">
      {/* Info */}
      <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-2">
        <p className="text-sm font-medium">Einmalige Migration — Kalaie-Format oder Standard-CSV</p>
        <p className="text-sm text-muted-foreground">
          Importiere deine bestehende Buchhaltungs-Tabelle (MSM BUCHHALTUNG.xlsx oder ähnlich)
          und Standard-CSV-Dateien. Deals werden per Bestell-ID dedupliziert.
        </p>
        <button
          onClick={downloadTemplate}
          className="inline-flex items-center gap-1.5 text-xs text-foreground underline underline-offset-4 hover:no-underline"
        >
          <Download className="h-3.5 w-3.5" />
          Standard-CSV-Vorlage herunterladen
        </button>
      </div>

      {/* Upload-Schritt */}
      {step === "upload" && (
        <>
          <div
            onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files); }}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "rounded-lg border-2 border-dashed border-border bg-muted/10 px-8 py-10 text-center space-y-3 cursor-pointer transition-colors hover:border-border/80",
              fileEntries.length > 0 && "py-6",
            )}
          >
            <div className="flex justify-center">
              <div className="rounded-full bg-muted p-3">
                <Upload className="h-6 w-6 text-muted-foreground" />
              </div>
            </div>
            <div>
              <p className="font-medium">
                {fileEntries.length > 0 ? "Weitere Datei hinzufügen" : "Excel (.xlsx) oder Standard-CSV hochladen"}
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Kalaie-Tabellen-Format oder Standard-CSV — mehrere Dateien gleichzeitig möglich
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

          {fileEntries.length > 0 && (
            <div className="space-y-4">
              {/* Abschlussdatum */}
              {fileEntries.some((e) => e.format === "column") && (
                <div className="flex items-center gap-2 text-sm">
                  <Label htmlFor="mig_date" className="text-muted-foreground whitespace-nowrap">
                    Abschlussdatum (Standard):
                  </Label>
                  <Input
                    id="mig_date"
                    type="date"
                    value={defaultDate}
                    onChange={(e) => handleDateChange(e.target.value)}
                    className="h-7 w-36 text-xs"
                  />
                </div>
              )}

              {fileEntries.map((entry) => (
                <div key={entry.name} className="rounded-lg border border-border overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-muted/20 border-b border-border">
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm font-medium">{entry.name}</span>
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        entry.format === "column" ? "bg-blue-500/15 text-blue-400" : "bg-emerald-500/15 text-emerald-400",
                      )}>
                        {entry.format === "column" ? "Kalaie-Format" : "Standard-CSV"}
                      </span>
                      <span className="text-xs text-muted-foreground">{entry.rows.length} Deals</span>
                    </div>
                    <button onClick={() => setFileEntries((p) => p.filter((e) => e.name !== entry.name))} className="text-muted-foreground hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="overflow-auto max-h-48">
                    <table className="w-full text-xs">
                      <thead className="border-b border-border bg-muted/20 sticky top-0">
                        <tr>
                          {["Kunde", "Bestell-ID", "Preis", "Zahlungsart", "Raten", "Abschluss", "Plattform"].map((h) => (
                            <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {entry.rows.slice(0, 15).map((r, i) => (
                          <tr key={i} className={cn(!r.customer_name && "opacity-50")}>
                            <td className="px-3 py-1.5 font-medium whitespace-nowrap">{r.customer_name || "—"}</td>
                            <td className="px-3 py-1.5 font-mono text-muted-foreground">{r.order_id || "—"}</td>
                            <td className="px-3 py-1.5 tabular-nums">{r.total_price ? fmt.format(Number(r.total_price)) : "—"}</td>
                            <td className="px-3 py-1.5">{r.payment_type || "—"}</td>
                            <td className="px-3 py-1.5 text-center">{r.number_of_rates || "—"}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{r.close_date || "—"}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{r.platform_name || "—"}</td>
                          </tr>
                        ))}
                        {entry.rows.length > 15 && (
                          <tr><td colSpan={7} className="px-3 py-2 text-center text-muted-foreground">+ {entry.rows.length - 15} weitere…</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

              <div className="flex gap-3 pt-1">
                <Button onClick={handleConfirm} disabled={pending}>
                  {pending ? "Wird importiert…" : `${fileEntries.reduce((s, e) => s + e.rows.length, 0)} Deals importieren`}
                </Button>
                <Button variant="outline" onClick={fullReset}>Abbrechen</Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Ergebnis */}
      {step === "done" && (
        <div className="space-y-4">
          {importResults.map((res, i) => {
            const ir = res.result;
            const hasError = ir.errors.length > 0;
            return (
              <div key={i} className={cn(
                "rounded-lg border p-4 space-y-2",
                hasError ? "border-amber-500/40 bg-amber-500/10" : "border-emerald-500/40 bg-emerald-500/10",
              )}>
                <div className="flex items-center gap-2">
                  {hasError
                    ? <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                    : <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />}
                  <span className="text-sm font-medium text-muted-foreground">{res.name}</span>
                </div>
                <p className="text-sm font-medium">
                  {ir.imported > 0 && `${ir.imported} neu angelegt`}
                  {ir.imported > 0 && ir.updated > 0 && " · "}
                  {ir.updated > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <RefreshCw className="h-3 w-3" />{ir.updated} aktualisiert
                    </span>
                  )}
                  {ir.skipped > 0 && ` · ${ir.skipped} übersprungen`}
                  {ir.imported === 0 && ir.updated === 0 && "Keine neuen Deals."}
                </p>
                {ir.imported > 0 && (
                  <p className="text-xs text-blue-400">
                    <Link href="/deals" className="underline underline-offset-2 hover:text-blue-300">
                      Zu den Deals →
                    </Link>
                  </p>
                )}
                {ir.errors.length > 0 && (
                  <ul className="space-y-1 text-xs text-amber-400">
                    {ir.errors.slice(0, 5).map((e, j) => <li key={j}>• {e}</li>)}
                    {ir.errors.length > 5 && <li>+ {ir.errors.length - 5} weitere…</li>}
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

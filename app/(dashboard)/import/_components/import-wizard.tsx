"use client";

import { useRef, useState, useTransition } from "react";
import { Upload, FileText, AlertTriangle, CheckCircle, X } from "lucide-react";
import * as XLSX from "xlsx";

import { importDeals, type ImportRow, type ImportResult } from "@/lib/actions/import";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// ─── Standard CSV template download ──────────────────────────────────────────

const TEMPLATE_HEADERS = [
  "Kunde", "Bestell-ID", "Plattform", "Produkt", "Zahlart",
  "Closer", "Vertriebspartner", "Gesamtpreis", "Zahlungsart",
  "Abschlussdatum", "Anzahl Raten", "Erstes Fälligkeitsdatum",
  "Onboarding", "Update-Call", "Inkasso", "Notizen",
];

function downloadTemplate() {
  const rows = [
    TEMPLATE_HEADERS.join(";"),
    "Max Mustermann;ORD-001;Copecart;Kurs A;Überweisung;Hans Closer;Partner GmbH;1200;Ratenzahlung;01.01.2026;3;01.02.2026;ja;nein;nein;",
    "Anna Schmidt;;Digistore;Kurs B;;Lisa Closer;;500;Einmalzahlung;15.01.2026;;;ja;;nein;Wichtiger Kunde",
  ].join("\n");
  const blob = new Blob(["﻿" + rows], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "deals-import-vorlage.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Standard CSV mapper (row-based) ─────────────────────────────────────────

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
    onboarding_done: get(["onboarding"]),
    update_call_done: get(["update-call", "update_call"]),
    inkasso_required: get(["inkasso"]),
    notes: get(["notizen", "notes", "anmerkungen"]),
  };
}

// ─── Column-based parser (Kalaie / MSM format) ───────────────────────────────

function parseGermanPrice(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") return isNaN(val) ? null : val;
  const s = String(val);
  // Remove € and spaces, handle both German (1.234,56) and English (1,234.56) formats
  let clean = s.replace(/€/g, "").replace(/\s/g, "");
  // English format: comma as thousand sep, dot as decimal
  if (/^\d{1,3}(,\d{3})*(\.\d+)?$/.test(clean)) {
    clean = clean.replace(/,/g, "");
  } else {
    // German format: dot as thousand sep, comma as decimal
    clean = clean.replace(/\./g, "").replace(",", ".");
  }
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

function detectPlatform(desc: string): string {
  const d = desc.toLowerCase();
  if (d.includes("copecart") || d.includes("cope")) return "Copecart";
  if (d.includes("digistore")) return "Digistore";
  if (d.includes("ablify") || d.includes("ablefy")) return "Ablefy";
  return "";
}

// Normalize row labels: trim whitespace, remove trailing colon, lowercase
function normLabel(val: unknown): string {
  return String(val ?? "").trim().toLowerCase().replace(/:$/, "").replace(/\s+/g, " ");
}

function parseColumnBasedRows(rawRows: unknown[][]): ImportRow[] | null {
  if (rawRows.length < 5) return null;

  // Build label → row values map
  const rowByLabel = new Map<string, unknown[]>();
  for (const row of rawRows) {
    const label = normLabel(row[0]);
    if (label) rowByLabel.set(label, row.slice(1));
  }

  // Must have at least one of these to be a valid column-based file
  const totalRow =
    rowByLabel.get("gesamtpaket") ??
    rowByLabel.get("preispaket") ??
    rowByLabel.get("gesamtpreis");

  const orderIdRow =
    rowByLabel.get("bestell-id") ??
    rowByLabel.get("bestl. id") ??
    rowByLabel.get("bestell id") ??
    rowByLabel.get("bestellnummer");

  if (!totalRow) return null;

  // Find customer names: first non-empty row where col A is empty
  let customerNames: unknown[] = [];
  let descRow: unknown[] = [];

  for (const row of rawRows) {
    const labelCell = String(row[0] ?? "").trim();
    if (labelCell === "" && row.slice(1).some((c) => String(c ?? "").trim())) {
      customerNames = row.slice(1);
      break;
    }
    // If "Rate:" row — the descriptions are in the same row
    if (normLabel(row[0]) === "rate") {
      descRow = row.slice(1);
    }
  }

  // Also check if "Rate:" row contains descriptions
  const rateRow = rowByLabel.get("rate");
  if (rateRow && rateRow.some((v) => String(v ?? "").trim().length > 3)) {
    descRow = rateRow;
  }

  // If customer names still empty, take row index 1 as fallback
  if (customerNames.every((c) => !String(c ?? "").trim())) {
    customerNames = rawRows[1]?.slice(1) ?? [];
  }

  // Collect rate rows
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

    const filledRates = rateRows.filter((r) => {
      const v = parseGermanPrice(r[col]);
      return v !== null && v > 0;
    });
    const numRates = filledRates.length;
    const paymentType = numRates > 1 ? "Ratenzahlung" : "Einmalzahlung";

    const desc = String(descRow[col] ?? "").trim().replace(/^\n/, "");
    const orderId = String(orderIdRow?.[col] ?? "").trim().replace(/^\n/, "");
    const platform = detectPlatform(desc);

    deals.push({
      customer_name: name,
      order_id: orderId || undefined,
      platform_name: platform || undefined,
      total_price: totalPrice.toString(),
      payment_type: paymentType,
      close_date: "",
      number_of_rates: numRates > 1 ? numRates.toString() : undefined,
      notes: desc || undefined,
    });
  }

  return deals.length > 0 ? deals : null;
}

// ─── File parsing ─────────────────────────────────────────────────────────────

type ParsedFile = { format: "column" | "standard"; rows: ImportRow[] };

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
  // Try to detect delimiter
  const firstLine = text.split("\n")[0] ?? "";
  const delimiter = firstLine.includes(";") ? ";" : ",";

  // Split into rows
  const rawRows = text.split("\n").map((line) =>
    line.split(delimiter).map((cell) => cell.replace(/^"|"$/g, "").trim()),
  );

  const colParsed = parseColumnBasedRows(rawRows);
  if (colParsed) return { format: "column", rows: colParsed };

  // Fall back to standard row-based format
  const headers = rawRows[0];
  const rows = rawRows.slice(1)
    .filter((r) => r.some((c) => c.trim()))
    .map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = r[i] ?? ""; });
      return mapStandardRow(obj);
    })
    .filter((r) => r.customer_name);

  if (rows.length === 0) return "Keine Deals gefunden.";
  return { format: "standard", rows };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ImportWizard() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [format, setFormat] = useState<"column" | "standard" | null>(null);
  const [defaultDate, setDefaultDate] = useState(new Date().toISOString().slice(0, 10));

  function applyDate(r: ImportRow[], date: string): ImportRow[] {
    return r.map((row) => ({ ...row, close_date: row.close_date || date }));
  }

  function handleFile(file: File) {
    if (!file) return;
    resetState();
    setFileName(file.name);

    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = parseXlsx(e.target!.result as ArrayBuffer);
        if (typeof result === "string") { setParseError(result); return; }
        setFormat(result.format);
        setRows(applyDate(result.rows, defaultDate));
      };
      reader.readAsArrayBuffer(file);
    } else if (ext === "csv") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = parseCsvText(e.target!.result as string);
        if (typeof result === "string") { setParseError(result); return; }
        setFormat(result.format);
        setRows(applyDate(result.rows, defaultDate));
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
    startTransition(async () => {
      const res = await importDeals(rows);
      setResult(res);
      if (res.imported > 0) setRows([]);
    });
  }

  function resetState() {
    setRows([]);
    setParseError("");
    setFormat(null);
  }

  function fullReset() {
    resetState();
    setFileName("");
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleDateChange(date: string) {
    setDefaultDate(date);
    setRows((prev) => prev.map((r) => ({ ...r, close_date: r.close_date || date })));
  }

  return (
    <div className="space-y-6">
      {/* Info */}
      <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-3">
        <p className="text-sm font-medium">Unterstützte Formate</p>
        <div className="grid sm:grid-cols-2 gap-3 text-sm text-muted-foreground">
          <div className="space-y-1">
            <p className="font-medium text-foreground">📊 Excel / CSV (Tabellen-Format)</p>
            <p>Deine bestehende Buchhaltungs-Tabelle — Kunden als Spalten, Raten als Zeilen. Einfach hochladen, wird automatisch erkannt.</p>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-foreground">📄 Standard-CSV</p>
            <p>Eine Zeile pro Deal. Lade die Vorlage herunter, fülle sie aus und importiere sie.</p>
            <button
              onClick={downloadTemplate}
              className="text-xs text-foreground underline underline-offset-4 hover:no-underline mt-1"
            >
              Vorlage herunterladen
            </button>
          </div>
        </div>
      </div>

      {/* Drop zone */}
      {rows.length === 0 && !result && (
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

      {/* Format badge + date picker */}
      {rows.length > 0 && format && (
        <div className="flex flex-wrap items-center gap-3">
          <span className={cn(
            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
            format === "column"
              ? "bg-blue-500/15 text-blue-400"
              : "bg-emerald-500/15 text-emerald-400",
          )}>
            {format === "column" ? "Tabellen-Format erkannt" : "Standard-CSV erkannt"}
          </span>

          {format === "column" && (
            <div className="flex items-center gap-2 text-sm">
              <Label htmlFor="default_date" className="text-muted-foreground whitespace-nowrap">
                Abschlussdatum (für alle Deals):
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

      {/* Preview */}
      {rows.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{fileName}</span>
              <span className="text-sm text-muted-foreground">
                — {rows.length} {rows.length === 1 ? "Deal" : "Deals"} erkannt
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
                  {["Kunde", "Bestell-ID", "Preis", "Zahlungsart", "Raten", "Plattform", "Notizen"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.slice(0, 15).map((r, i) => (
                  <tr key={i} className={cn(!r.customer_name && "opacity-50 bg-destructive/5")}>
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{r.customer_name || "—"}</td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground whitespace-nowrap">{r.order_id || "—"}</td>
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                      {r.total_price
                        ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(r.total_price))
                        : "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.payment_type || "—"}</td>
                    <td className="px-3 py-2 text-center">{r.number_of_rates || "1"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.platform_name || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[160px] truncate">{r.notes || "—"}</td>
                  </tr>
                ))}
                {rows.length > 15 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-2 text-center text-muted-foreground">
                      + {rows.length - 15} weitere…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleImport} disabled={pending}>
              {pending ? `Importiere ${rows.length} Deals…` : `${rows.length} Deals importieren`}
            </Button>
            <Button variant="outline" onClick={fullReset}>Abbrechen</Button>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-3">
          <div className={cn(
            "rounded-lg border p-4 space-y-2",
            result.errors.length === 0
              ? "border-emerald-500/40 bg-emerald-500/10"
              : "border-amber-500/40 bg-amber-500/10",
          )}>
            <div className="flex items-center gap-2">
              {result.errors.length === 0
                ? <CheckCircle className="h-4 w-4 text-emerald-400" />
                : <AlertTriangle className="h-4 w-4 text-amber-400" />}
              <span className="text-sm font-medium">
                {result.imported} Deals importiert
                {result.skipped > 0 && `, ${result.skipped} übersprungen`}
              </span>
            </div>
            {result.errors.length > 0 && (
              <ul className="space-y-1 text-xs text-amber-400">
                {result.errors.slice(0, 10).map((e, i) => <li key={i}>• {e}</li>)}
                {result.errors.length > 10 && <li>+ {result.errors.length - 10} weitere…</li>}
              </ul>
            )}
          </div>
          <Button variant="outline" onClick={fullReset}>Weiteren Import starten</Button>
        </div>
      )}
    </div>
  );
}

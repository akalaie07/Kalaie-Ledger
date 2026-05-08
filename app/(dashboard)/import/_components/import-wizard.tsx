"use client";

import { useRef, useState, useTransition } from "react";
import { Upload, FileText, AlertTriangle, CheckCircle, X, Download } from "lucide-react";
import Papa from "papaparse";

import { importDeals, type ImportRow, type ImportResult } from "@/lib/actions/import";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// ─── Kalaie example download ─────────────────────────────────────────────────

function downloadKalaieExample() {
  const sep = ";";
  const rows = [
    // Row 0: customer names
    ["", "Max Mustermann", "Sarah Becker", "Jonas Weber", "Lena Fischer", "Tom Richter"].join(sep),
    // Row 1: description
    ["", "RZ, Copecart Gold", "RZ, Digistore Gold", "RZ, Copecart Gold", "EZ Ablefy", "RZ, Copecart Gold"].join(sep),
    // Row 2: rate (commission, optional)
    ["Rate:", "", "", "", "", ""].join(sep),
    // Row 3: Bestell-ID
    ["Bestell-ID", "2ebe24db", "NAFJKRZL", "24HAARM5", "rzVMT1Xg", "13724255"].join(sep),
    // Rates 1-12
    ["1.Rate", "291,66", "130,25", "130,25", "2.941,20", "140,09"].join(sep),
    ["2.Rate", "", "130,25", "130,25", "", "140,09"].join(sep),
    ["3.Rate", "", "130,25", "130,25", "", "140,09"].join(sep),
    ["4.Rate", "", "130,25", "", "", "140,09"].join(sep),
    ["5.Rate", "", "130,25", "", "", "140,09"].join(sep),
    ["6.Rate", "", "130,25", "", "", "140,09"].join(sep),
    ["7.Rate", "", "", "", "", "140,09"].join(sep),
    ["8.Rate", "", "", "", "", "140,09"].join(sep),
    ["9.Rate", "", "", "", "", "140,09"].join(sep),
    ["10.Rate", "", "", "", "", "140,09"].join(sep),
    ["11.Rate", "", "", "", "", "140,09"].join(sep),
    ["12.Rate", "", "", "", "", "140,09"].join(sep),
    ["13.Rate", "", "", "", "", ""].join(sep),
    ["14.Rate", "", "", "", "", ""].join(sep),
    ["15.Rate", "", "", "", "", ""].join(sep),
    ["16.Rate", "", "", "", "", ""].join(sep),
    ["17.Rate", "", "", "", "", ""].join(sep),
    ["18.Rate", "", "", "", "", ""].join(sep),
    ["19.Rate", "", "", "", "", ""].join(sep),
    ["20.Rate", "", "", "", "", ""].join(sep),
    // Summary rows
    ["Summe:", "291,66", "781,50", "390,75", "2.941,20", "1.681,08"].join(sep),
    ["Gebühren:", "2.941,20", "2.941,20", "2.941,20", "2.941,20", "2.941,89"].join(sep),
    ["Gesamtpaket", "2.941,20", "2.941,20", "2.941,20", "2.941,20", "2.941,89"].join(sep),
    ["Differenz:", "-2.649,54", "-2.159,70", "-2.550,45", "0,00", "-1.260,81"].join(sep),
    ["GESAMT:", "-8.619,70", "", "", "", ""].join(sep),
  ];
  const content = rows.join("\n");
  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "beispiel-tabelle.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Standard CSV template ───────────────────────────────────────────────────

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

// ─── Kalaie column-based parser ───────────────────────────────────────────────

function parseGermanPrice(val: string): number | null {
  if (!val) return null;
  // Remove €, spaces, thousand-separator dots, then replace decimal comma
  const clean = val.replace(/€/g, "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

function detectPlatform(desc: string): string {
  const d = desc.toLowerCase();
  if (d.includes("copecart")) return "Copecart";
  if (d.includes("digistore")) return "Digistore";
  if (d.includes("ablify") || d.includes("ablefy")) return "Ablefy";
  return "";
}

function parseKalaieCsv(rawRows: string[][], defaultDate: string): ImportRow[] {
  if (rawRows.length < 3) return [];

  // Row 0: ['', 'Kunde A', 'Kunde B', ...]
  // Row 1: ['', 'RZ Copecart Gold', ...]
  // Rows with label in col 0: 'Bestell-ID', '1.Rate', '2.Rate', ..., 'Gesamtpaket'
  const customerNames = rawRows[0].slice(1);
  const descriptions = rawRows[1]?.slice(1) ?? [];

  // Index rows by label in column A
  const rowByLabel = new Map<string, string[]>();
  for (const row of rawRows) {
    const label = (row[0] ?? "").trim().toLowerCase().replace(/:$/, "");
    if (label) rowByLabel.set(label, row.slice(1));
  }

  const orderIds = rowByLabel.get("bestell-id") ?? [];
  const gesamtpaket = rowByLabel.get("gesamtpaket") ?? [];

  // Collect all rate rows in order
  const rateRows: string[][] = [];
  for (let r = 1; r <= 20; r++) {
    const row = rowByLabel.get(`${r}.rate`);
    if (row) rateRows.push(row);
  }

  const deals: ImportRow[] = [];

  for (let col = 0; col < customerNames.length; col++) {
    const name = (customerNames[col] ?? "").trim();
    if (!name) continue;

    const totalPriceRaw = gesamtpaket[col] ?? "";
    const totalPrice = parseGermanPrice(totalPriceRaw);
    if (!totalPrice || totalPrice <= 0) continue;

    // Count non-empty, non-zero rate cells for this column
    const filledRates = rateRows.filter((r) => {
      const v = parseGermanPrice(r[col] ?? "");
      return v !== null && v > 0;
    });
    const numRates = filledRates.length;

    const paymentType = numRates > 1 ? "Ratenzahlung" : "Einmalzahlung";
    const desc = (descriptions[col] ?? "").trim();
    const platform = detectPlatform(desc);

    deals.push({
      customer_name: name,
      order_id: (orderIds[col] ?? "").trim() || undefined,
      platform_name: platform || undefined,
      total_price: totalPrice.toString(),
      payment_type: paymentType,
      close_date: defaultDate,
      number_of_rates: numRates > 1 ? numRates.toString() : undefined,
      notes: desc || undefined,
    });
  }

  return deals;
}

// ─── Detect format ────────────────────────────────────────────────────────────

function detectFormat(rawRows: string[][]): "kalaie" | "standard" {
  if (rawRows.length < 3) return "standard";
  // If any cell in column A matches a known Kalaie row label → Kalaie format
  const labels = rawRows.map((r) => (r[0] ?? "").trim().toLowerCase().replace(/:$/, ""));
  const kalaieLabels = ["bestell-id", "gesamtpaket", "1.rate", "summe"];
  return kalaieLabels.some((l) => labels.includes(l)) ? "kalaie" : "standard";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ImportWizard() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [detectedFormat, setDetectedFormat] = useState<"kalaie" | "standard" | null>(null);
  const [defaultDate, setDefaultDate] = useState(new Date().toISOString().slice(0, 10));

  function handleFile(file: File) {
    if (!file) return;
    reset(false);
    setFileName(file.name);

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "csv") {
      setParseError("Nur CSV-Dateien werden unterstützt. Exportiere deine Tabelle als CSV (Datei → Herunterladen → CSV).");
      return;
    }

    // Parse without headers first to detect format
    Papa.parse<string[]>(file, {
      header: false,
      skipEmptyLines: false,
      delimiter: "",
      complete: (res) => {
        const rawRows = res.data as string[][];
        const format = detectFormat(rawRows);
        setDetectedFormat(format);

        if (format === "kalaie") {
          const deals = parseKalaieCsv(rawRows, defaultDate);
          if (deals.length === 0) {
            setParseError("Kein Deal erkannt. Stelle sicher, dass die Datei eine 'Bestell-ID'- und 'Gesamtpaket'-Zeile enthält.");
          } else {
            setRows(deals);
          }
        } else {
          // Re-parse with headers for standard format
          Papa.parse<Record<string, string>>(file, {
            header: true,
            skipEmptyLines: true,
            delimiter: "",
            complete: (res2) => {
              const mapped = (res2.data as Record<string, string>[]).map(mapStandardRow);
              setRows(mapped);
            },
            error: (err) => setParseError(err.message),
          });
        }
      },
      error: (err) => setParseError(err.message),
    });
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

  function reset(full = true) {
    setRows([]);
    setParseError("");
    setDetectedFormat(null);
    if (full) {
      setFileName("");
      setResult(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Re-parse when defaultDate changes (only for Kalaie format)
  function handleDateChange(date: string) {
    setDefaultDate(date);
    if (detectedFormat === "kalaie" && rows.length > 0) {
      setRows((prev) => prev.map((r) => ({ ...r, close_date: date })));
    }
  }

  return (
    <div className="space-y-6">
      {/* Info + template */}
      <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-3">
        <p className="text-sm font-medium">Zwei Formate werden unterstützt:</p>
        <div className="grid sm:grid-cols-2 gap-3 text-sm text-muted-foreground">
          <div className="space-y-1">
            <p className="font-medium text-foreground">📋 Eigene Google-Tabelle</p>
            <p>Exportiere deine bestehende Tabelle als CSV — das Format wird automatisch erkannt (Kunden als Spalten, Raten als Zeilen).</p>
            <button
              onClick={downloadKalaieExample}
              className="inline-flex items-center gap-1 text-foreground underline underline-offset-4 hover:no-underline text-xs mt-1"
            >
              <Download className="h-3 w-3" />
              Beispiel herunterladen
            </button>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-foreground">📄 Standard-CSV</p>
            <p>Jede Zeile ist ein Deal. Lade die Vorlage herunter, fülle sie aus und importiere sie.</p>
            <button
              onClick={downloadTemplate}
              className="inline-flex items-center gap-1 text-foreground underline underline-offset-4 hover:no-underline text-xs mt-1"
            >
              <Download className="h-3 w-3" />
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
          className="rounded-lg border-2 border-dashed border-border bg-muted/10 px-8 py-12 text-center space-y-4 transition-colors hover:border-border/80 cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="flex justify-center">
            <div className="rounded-full bg-muted p-4">
              <Upload className="h-8 w-8 text-muted-foreground" />
            </div>
          </div>
          <div>
            <p className="font-medium">CSV-Datei hochladen</p>
            <p className="text-sm text-muted-foreground mt-1">
              Klicken oder Datei hier ablegen — Format wird automatisch erkannt
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>
      )}

      {parseError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          {parseError}
        </div>
      )}

      {/* Detected format badge + Kalaie options */}
      {rows.length > 0 && detectedFormat && (
        <div className="flex flex-wrap items-center gap-3">
          <span className={cn(
            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
            detectedFormat === "kalaie"
              ? "bg-blue-500/15 text-blue-400"
              : "bg-emerald-500/15 text-emerald-400",
          )}>
            {detectedFormat === "kalaie" ? "Google-Tabellen-Format erkannt" : "Standard-CSV erkannt"}
          </span>

          {detectedFormat === "kalaie" && (
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

      {/* Preview table */}
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
            <button onClick={() => reset(true)} className="text-muted-foreground hover:text-foreground transition-colors">
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
                    <td className="px-3 py-2 text-center">{r.number_of_rates || "—"}</td>
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
            <Button variant="outline" onClick={() => reset(true)}>
              Abbrechen
            </Button>
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
              {result.errors.length === 0 ? (
                <CheckCircle className="h-4 w-4 text-emerald-400" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-400" />
              )}
              <span className="text-sm font-medium">
                {result.imported} Deals importiert
                {result.skipped > 0 && `, ${result.skipped} übersprungen`}
              </span>
            </div>
            {result.errors.length > 0 && (
              <ul className="space-y-1 text-xs text-amber-400">
                {result.errors.slice(0, 10).map((e, i) => (
                  <li key={i}>• {e}</li>
                ))}
                {result.errors.length > 10 && (
                  <li>+ {result.errors.length - 10} weitere Fehler…</li>
                )}
              </ul>
            )}
          </div>
          <Button variant="outline" onClick={() => reset(true)}>
            Weiteren Import starten
          </Button>
        </div>
      )}
    </div>
  );
}

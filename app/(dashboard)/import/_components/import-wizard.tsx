"use client";

import { useRef, useState, useTransition } from "react";
import { Upload, FileText, AlertTriangle, CheckCircle, X } from "lucide-react";
import Papa from "papaparse";

import { importDeals, type ImportRow, type ImportResult } from "@/lib/actions/import";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TEMPLATE_HEADERS = [
  "Kunde",
  "Bestell-ID",
  "Plattform",
  "Produkt",
  "Zahlart",
  "Closer",
  "Vertriebspartner",
  "Gesamtpreis",
  "Zahlungsart",
  "Abschlussdatum",
  "Anzahl Raten",
  "Erstes Fälligkeitsdatum",
  "Onboarding",
  "Update-Call",
  "Inkasso",
  "Notizen",
];

function mapRow(raw: Record<string, string>): ImportRow {
  // Support German and English column names
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

export function ImportWizard() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();

  function handleFile(file: File) {
    if (!file) return;
    setResult(null);
    setParseError("");
    setFileName(file.name);

    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "csv") {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        delimiter: "", // auto-detect
        complete: (res) => {
          const mapped = (res.data as Record<string, string>[]).map(mapRow);
          setRows(mapped);
        },
        error: (err) => setParseError(err.message),
      });
    } else {
      setParseError("Nur CSV-Dateien werden unterstützt. Konvertiere XLSX zuerst in CSV.");
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

  function reset() {
    setRows([]);
    setFileName("");
    setParseError("");
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="space-y-6">
      {/* Template download */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Lade die Vorlage herunter, fülle sie aus und importiere sie dann hier.
        </p>
        <button
          onClick={downloadTemplate}
          className="text-sm text-foreground underline underline-offset-4 hover:no-underline shrink-0"
        >
          Vorlage herunterladen
        </button>
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
              Klicken oder Datei hier ablegen
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
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {parseError}
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
                — {rows.length} {rows.length === 1 ? "Zeile" : "Zeilen"} erkannt
              </span>
            </div>
            <button onClick={reset} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Table preview (first 10 rows) */}
          <div className="rounded-lg border border-border overflow-auto max-h-72">
            <table className="w-full text-xs">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  {["Kunde", "Preis", "Zahlungsart", "Abschluss", "Closer", "Plattform"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.slice(0, 10).map((r, i) => (
                  <tr key={i} className={cn(!r.customer_name && "opacity-50 bg-destructive/5")}>
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{r.customer_name || "—"}</td>
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap">{r.total_price || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.payment_type || "—"}</td>
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap">{r.close_date || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.closer_name || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.platform_name || "—"}</td>
                  </tr>
                ))}
                {rows.length > 10 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-2 text-center text-muted-foreground">
                      + {rows.length - 10} weitere Zeilen…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleImport} disabled={pending}>
              {pending ? `Importiere ${rows.length} Zeilen…` : `${rows.length} Deals importieren`}
            </Button>
            <Button variant="outline" onClick={reset}>
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
          <Button variant="outline" onClick={reset}>
            Weiteren Import starten
          </Button>
        </div>
      )}
    </div>
  );
}

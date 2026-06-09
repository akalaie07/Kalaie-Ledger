"use client";

/**
 * CsvImportWizard — Generischer 4-Schritt Import für Plattform-CSV-Exporte.
 *
 * Schritt 1: CSV hochladen (Drag & Drop, UTF-8 / Latin-1 Fallback)
 * Schritt 2: Felder zuordnen (Auto-Erkennung + manuelle Dropdowns, 3-Zeilen Vorschau)
 * Schritt 3: Zeilen prüfen & bearbeiten (editierbare Tabelle, Issue-Hervorhebung)
 * Schritt 4: Import bestätigen → importDeals() → Ergebnis
 *
 * Wird über eine PlatformConfig pro Plattform spezialisiert.
 */

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle,
  X,
  ArrowRight,
  Trash2,
  Info,
} from "lucide-react";

import { importDeals } from "@/lib/actions/import";
import type { ImportRow, ImportResult } from "@/lib/actions/import";
import { resolveImport, saveAliases } from "@/lib/actions/import-aliases";
import type { EntityCandidate, ResolveResult } from "@/lib/import/resolve";
import { ProductMappingStep } from "./product-mapping-step";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  PLATFORM_AUTO_DETECT,
  PLATFORM_FILTER_PAID,
} from "@/app/(dashboard)/import/_lib/platform-configs";

// =============================================================================
// Types
// =============================================================================

type WizardStep = "upload" | "mapping" | "edit" | "done";

/** Welche CSV-Spalten-Index für jedes Zielfeld */
export type ColumnMap = {
  customerFirst: number;  // bei "split"-Modus: Vorname; bei "single"-Modus: einziger Namensfeld
  customerLast: number;   // bei "split"-Modus: Nachname; bei "single"-Modus: -1
  orderId: number;
  product: number;
  totalPrice: number;
  paymentType: number;
  date: number;
  status: number;
};

export type EditableRow = {
  _id: string;
  customer_name: string;
  order_id: string;
  product_name: string;
  total_price: string;
  payment_type: string;
  close_date: string;
  _rawStatus: string;
};

export type MappingField = {
  key: keyof Omit<ColumnMap, "status">;
  label: string;
  hint: string;
  required: boolean;
};

export type PlatformConfig = {
  platform: "ablefy" | "digistore" | "copecart";
  platformLabel: string;
  accentColor: "cyan" | "amber" | "purple";
  exportHint: string;
  customerNameMode: "split" | "single";
  mappingFields: MappingField[];
  // autoDetect und filterPaid werden NICHT als Props übergeben (Funktionen
  // können nicht von Server → Client Components serialisiert werden).
  // Der Wizard lädt sie intern aus _lib/platform-configs.ts anhand von `platform`.
};

// =============================================================================
// Hilfs-Funktionen
// =============================================================================

/** Einfaches CSV-Parsen mit konfigurierbarem Trennzeichen */
function parseCsvLine(line: string, sep = ";"): string[] {
  const result: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      inQuotes = !inQuotes;
    } else if (line[i] === sep && !inQuotes) {
      result.push(field.trim());
      field = "";
    } else {
      field += line[i];
    }
  }
  result.push(field.trim());
  return result;
}

/** Normalisiert Header-Namen für fuzzy Matching */
export function normHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parst Preisformate flexibel:
 *   "1.234,56" → 1234.56  (deutsch: Punkt=Tausender, Komma=Dezimal)
 *   "1,234.56" → 1234.56  (englisch: Komma=Tausender, Punkt=Dezimal)
 *   "25.2"     → 25.2     (englisch dezimal — Copecart Nettopreis-Spalte)
 *   "25,20"    → 25.2     (deutsch dezimal)
 *   "1.234"    → 1234     (deutsch Tausender ohne Dezimalstellen)
 */
function parseGermanPrice(val: string): number {
  if (!val) return 0;
  const v = val.replace(/[€$\s]/g, "").trim();
  if (!v) return 0;

  const hasDot   = v.includes(".");
  const hasComma = v.includes(",");

  // Beide Trenner vorhanden → welcher kommt zuletzt = Dezimaltrenner
  if (hasDot && hasComma) {
    const lastDot   = v.lastIndexOf(".");
    const lastComma = v.lastIndexOf(",");
    if (lastDot > lastComma) {
      // Englisch: "1,234.56"
      const n = parseFloat(v.replace(/,/g, ""));
      return isNaN(n) ? 0 : n;
    } else {
      // Deutsch: "1.234,56"
      const n = parseFloat(v.replace(/\./g, "").replace(",", "."));
      return isNaN(n) ? 0 : n;
    }
  }

  // Nur Komma → Komma ist Dezimaltrenner ("25,20")
  if (hasComma && !hasDot) {
    const n = parseFloat(v.replace(",", "."));
    return isNaN(n) ? 0 : n;
  }

  // Nur Punkt → Punkt ist Tausendertrenner NUR wenn genau 3 Nachkommastellen ("1.234")
  // Sonst Dezimaltrenner ("25.2", "252.00")
  if (hasDot && !hasComma) {
    const parts = v.split(".");
    const afterDot = parts[parts.length - 1];
    if (parts.length === 2 && afterDot.length === 3) {
      // Tausendertrenner: "1.234" → 1234
      const n = parseFloat(v.replace(".", ""));
      return isNaN(n) ? 0 : n;
    }
    // Dezimaltrenner: "25.2" → 25.2
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  // Kein Trenner
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

/** Zahlungstyp-Wert → importDeals-kompatible Zahlungsart */
function normalizePaymentType(val: string): string {
  const v = val.toLowerCase();
  if (v.includes("einmal") || v === "one" || v === "one_time") return "one_time";
  if (
    v.includes("rate") ||
    v.includes("abo") ||
    v.includes("subscription") ||
    /\d+\s*x/.test(v)
  )
    return "installments";
  return "one_time";
}

function formatPaymentType(pt: string): string {
  if (pt === "one_time") return "Einmalzahlung";
  if (pt === "installments") return "Ratenzahlung";
  return pt;
}

/** Gibt die Probleme einer Zeile zurück */
function getIssues(row: EditableRow): string[] {
  const issues: string[] = [];
  if (!row.customer_name.trim()) issues.push("Kundenname fehlt");
  if (!row.order_id.trim()) issues.push("Bestell-ID fehlt");
  const price = parseGermanPrice(row.total_price);
  if (!row.total_price.trim() || price <= 0) issues.push("Preis fehlt/ungültig");
  if (!row.close_date.trim()) issues.push("Datum fehlt");
  return issues;
}

// =============================================================================
// Accent-Color-Helper
// =============================================================================

type AccentColor = "cyan" | "amber" | "purple";

const ACCENT = {
  cyan: {
    border: "border-cyan-500/30",
    bg: "bg-cyan-500/5",
    text: "text-cyan-300/80",
    textStrong: "text-cyan-300",
    textMono: "text-cyan-200",
    iconColor: "text-cyan-400",
    iconBg: "bg-cyan-500/20",
    dragBorder: "border-cyan-500",
    dragBg: "bg-cyan-500/5",
    stepActive: "bg-cyan-500",
  },
  amber: {
    border: "border-amber-500/30",
    bg: "bg-amber-500/5",
    text: "text-amber-300/80",
    textStrong: "text-amber-300",
    textMono: "text-amber-200",
    iconColor: "text-amber-400",
    iconBg: "bg-amber-500/20",
    dragBorder: "border-amber-500",
    dragBg: "bg-amber-500/5",
    stepActive: "bg-amber-500",
  },
  purple: {
    border: "border-purple-500/30",
    bg: "bg-purple-500/5",
    text: "text-purple-300/80",
    textStrong: "text-purple-300",
    textMono: "text-purple-200",
    iconColor: "text-purple-400",
    iconBg: "bg-purple-500/20",
    dragBorder: "border-purple-500",
    dragBg: "bg-purple-500/5",
    stepActive: "bg-purple-500",
  },
} as const;

// =============================================================================
// Schritt-Anzeige
// =============================================================================

const STEPS = [
  { id: "upload", label: "Datei" },
  { id: "mapping", label: "Felder" },
  { id: "edit", label: "Prüfen" },
  { id: "done", label: "Fertig" },
] as const;

function StepBar({
  current,
  accentColor,
}: {
  current: WizardStep;
  accentColor: AccentColor;
}) {
  const idx = STEPS.findIndex((s) => s.id === current);
  const accent = ACCENT[accentColor];
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <div key={s.id} className="flex items-center">
            <div
              className={cn(
                "flex items-center justify-center rounded-full w-7 h-7 text-xs font-semibold transition-colors",
                done
                  ? "bg-emerald-500 text-white"
                  : active
                    ? `${accent.stepActive} text-white`
                    : "bg-muted text-muted-foreground",
              )}
            >
              {done ? <CheckCircle className="h-4 w-4" /> : i + 1}
            </div>
            <span
              className={cn(
                "ml-1.5 text-xs font-medium",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "mx-3 h-px w-8 transition-colors",
                  done ? "bg-emerald-500" : "bg-border",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// Haupt-Komponente
// =============================================================================

export function CsvImportWizard({ config }: { config: PlatformConfig }) {
  const { platform, platformLabel, accentColor, exportHint, customerNameMode, mappingFields } =
    config;
  const accent = ACCENT[accentColor];

  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<WizardStep>("upload");
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [colMap, setColMap] = useState<ColumnMap>({
    customerFirst: -1,
    customerLast: -1,
    orderId: -1,
    product: -1,
    totalPrice: -1,
    paymentType: -1,
    date: -1,
    status: -1,
  });
  const [editableRows, setEditableRows] = useState<EditableRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [importing, startImport] = useTransition();

  // Produkt-Zuordnung (Smart Import)
  const [productCandidates, setProductCandidates] = useState<EntityCandidate[]>([]);
  const [productResults, setProductResults] = useState<ResolveResult[]>([]);
  const [productMappings, setProductMappings] = useState<Map<string, string>>(new Map());
  const [, startResolve] = useTransition();

  const fmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

  // ── Schritt 1: Datei verarbeiten ─────────────────────────────────────────

  function processCsv(name: string, text: string) {
    // Copecart nutzt Komma, alle anderen Semikolon
    const sep = platform === "copecart" ? "," : ";";
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      setParseError("Die Datei enthält keine Daten.");
      return;
    }

    const hdrs = parseCsvLine(lines[0], sep);
    const rows = lines.slice(1).map((l) => parseCsvLine(l, sep));
    const autoDetect = PLATFORM_AUTO_DETECT[platform];
    const detected = autoDetect ? autoDetect(hdrs) : ({
      customerFirst: -1, customerLast: -1, orderId: -1, product: -1,
      totalPrice: -1, paymentType: -1, date: -1, status: -1,
    } as ColumnMap);

    if (detected.orderId < 0) {
      setParseError(
        `Keine Bestell-ID Spalte gefunden. Ist das wirklich ein ${platformLabel}-Export?`,
      );
      return;
    }

    setParseError(null);
    setFileName(name);
    setHeaders(hdrs);
    setRawRows(rows);
    setColMap(detected);
  }

  function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setParseError("Bitte eine CSV-Datei hochladen (.csv).");
      return;
    }
    setParseError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target!.result as string;
      if (text.includes("Ã") || text.includes("�")) {
        const r2 = new FileReader();
        r2.onload = (e2) => processCsv(file.name, e2.target!.result as string);
        r2.readAsText(file, "iso-8859-1");
      } else {
        processCsv(file.name, text);
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  // ── Schritt 2 → 3: Mapping anwenden ─────────────────────────────────────

  function applyMapping() {
    const get = (row: string[], idx: number) =>
      idx >= 0 ? (row[idx]?.trim() ?? "") : "";

    let rows: EditableRow[] = rawRows
      .filter((row) => row.some((cell) => cell.trim()))
      .map((row, i) => {
        let customerName: string;
        if (customerNameMode === "split") {
          const first = get(row, colMap.customerFirst);
          const last = get(row, colMap.customerLast);
          customerName = [first, last].filter(Boolean).join(" ") || "Unbekannt";
        } else {
          customerName = get(row, colMap.customerFirst) || "Unbekannt";
        }

        const rawPayment = get(row, colMap.paymentType);
        const rawStatus = get(row, colMap.status);

        return {
          _id: `row-${i}`,
          customer_name: customerName,
          order_id: get(row, colMap.orderId),
          product_name: get(row, colMap.product),
          total_price: get(row, colMap.totalPrice),
          payment_type: normalizePaymentType(rawPayment),
          close_date: get(row, colMap.date),
          _rawStatus: rawStatus,
        };
      });

    // Filter: nur bezahlte Transaktionen anzeigen, wenn Status-Spalte erkannt
    const filterPaid = PLATFORM_FILTER_PAID[platform];
    if (colMap.status >= 0 && filterPaid) {
      const before = rows.length;
      rows = rows.filter((row) => filterPaid(row));
      if (rows.length === 0) {
        setParseError(
          `Keine bezahlten Zeilen gefunden (${before} Zeilen gefiltert). ` +
            "Prüfe ob die Status-Spalte korrekt zugeordnet ist.",
        );
        return;
      }
    }

    setParseError(null);
    setEditableRows(rows);
    setStep("edit");

    // Produkte aus dem Export gegen Stammdaten + Aliase auflösen
    const rawNames = [...new Set(rows.map((r) => r.product_name).filter(Boolean))];
    startResolve(async () => {
      if (rawNames.length === 0) {
        setProductCandidates([]);
        setProductResults([]);
        setProductMappings(new Map());
        return;
      }
      const resolution = await resolveImport("product", rawNames);
      setProductCandidates(resolution.candidates);
      setProductResults(resolution.results);
      const m = new Map<string, string>();
      for (const r of resolution.results) {
        if (r.status === "matched" && r.targetId) m.set(r.rawValue, r.targetId);
        else if (r.status === "suggested" && r.suggestion) m.set(r.rawValue, r.suggestion.id);
        else m.set(r.rawValue, "");
      }
      setProductMappings(m);
    });
  }

  function handleProductMap(rawValue: string, targetId: string) {
    setProductMappings((prev) => new Map(prev).set(rawValue, targetId));
  }

  function handleProductCreated(product: EntityCandidate) {
    setProductCandidates((prev) =>
      prev.some((c) => c.id === product.id) ? prev : [...prev, product],
    );
  }

  // ── Schritt 3: Zeilen bearbeiten ─────────────────────────────────────────

  function updateRow(
    id: string,
    field: keyof Omit<EditableRow, "_id" | "_rawStatus">,
    value: string,
  ) {
    setEditableRows((rows) =>
      rows.map((r) => (r._id === id ? { ...r, [field]: value } : r)),
    );
  }

  function removeRow(id: string) {
    setEditableRows((rows) => rows.filter((r) => r._id !== id));
  }

  // ── Schritt 4: Import ────────────────────────────────────────────────────

  function handleImport() {
    const toImport: ImportRow[] = editableRows
      .filter((row) => getIssues(row).length === 0)
      .map((row) => ({
        customer_name: row.customer_name,
        order_id: row.order_id || undefined,
        platform_name: platformLabel,
        product_name: row.product_name || undefined,
        total_price: String(parseGermanPrice(row.total_price)),
        payment_type: row.payment_type,
        close_date: row.close_date,
      }));

    startImport(async () => {
      // Bestätigte Produkt-Zuordnungen als Alias speichern → greift sofort in
      // importDeals und bei allen künftigen Importen automatisch.
      const attention = new Set(
        productResults.filter((r) => r.status !== "matched").map((r) => r.rawValue),
      );
      const aliasMappings = [...productMappings.entries()]
        .filter(([rawValue, targetId]) => !!targetId && attention.has(rawValue))
        .map(([rawValue, targetId]) => ({ rawValue, targetId }));
      if (aliasMappings.length > 0) {
        await saveAliases("product", aliasMappings);
      }

      const res = await importDeals(toImport);
      setResult(res);
      setStep("done");
    });
  }

  function fullReset() {
    setStep("upload");
    setFileName(null);
    setHeaders([]);
    setRawRows([]);
    setColMap({
      customerFirst: -1,
      customerLast: -1,
      orderId: -1,
      product: -1,
      totalPrice: -1,
      paymentType: -1,
      date: -1,
      status: -1,
    });
    setEditableRows([]);
    setParseError(null);
    setResult(null);
    setProductCandidates([]);
    setProductResults([]);
    setProductMappings(new Map());
    if (fileRef.current) fileRef.current.value = "";
  }

  const issueRows = editableRows.filter((r) => getIssues(r).length > 0);
  const readyRows = editableRows.filter((r) => getIssues(r).length === 0);
  const previewRows = rawRows.slice(0, 3);

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <div className="space-y-6">
      {/* Fortschrittsanzeige */}
      <StepBar current={step} accentColor={accentColor} />

      {/* ── Schritt 1: Upload ─────────────────────────────────────────────── */}
      {step === "upload" && (
        <div className="space-y-4">
          <div
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onClick={() => fileRef.current?.click()}
            className={cn(
              "rounded-xl border-2 border-dashed px-8 py-12 text-center cursor-pointer transition-all space-y-3",
              isDragging
                ? `${accent.dragBorder} ${accent.dragBg}`
                : "border-border bg-muted/10 hover:border-border/80 hover:bg-muted/20",
            )}
          >
            <div className="flex justify-center">
              <div
                className={cn(
                  "rounded-full p-4 transition-colors",
                  isDragging ? accent.iconBg : "bg-muted",
                )}
              >
                <Upload
                  className={cn(
                    "h-7 w-7 transition-colors",
                    isDragging ? accent.iconColor : "text-muted-foreground",
                  )}
                />
              </div>
            </div>
            <div>
              <p className="font-semibold text-base">
                {fileName ? "Andere Datei wählen" : `${platformLabel}-CSV hochladen`}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Datei hier ablegen oder klicken zum Auswählen
              </p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">{exportHint}</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>

          {parseError && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              {parseError}
            </div>
          )}

          {fileName && rawRows.length > 0 && !parseError && (
            <>
              <div
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-4 py-3",
                  accent.border,
                  accent.bg,
                )}
              >
                <FileText className={cn("h-4 w-4 shrink-0", accent.iconColor)} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {rawRows.length} Zeilen · {headers.length} Spalten erkannt
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    fullReset();
                  }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <Button onClick={() => setStep("mapping")} className="gap-2">
                Felder zuordnen
                <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      )}

      {/* ── Schritt 2: Felder zuordnen ────────────────────────────────────── */}
      {step === "mapping" && (
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold">Felder zuordnen</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Prüfe die automatische Erkennung und passe sie bei Bedarf an.
              </p>
            </div>
            <button
              onClick={() => setStep("upload")}
              className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Mapping-Tabelle */}
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs">
                    Zielfeld
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs">
                    Hinweis
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs">
                    Spalte zuordnen
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {mappingFields.map((f) => {
                  const currentIdx = colMap[f.key];
                  const isDetected = currentIdx >= 0;
                  return (
                    <tr key={f.key} className="hover:bg-muted/10 transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-xs">{f.label}</span>
                          {f.required && (
                            <span className="text-destructive text-xs">*</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {f.hint}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <select
                            value={currentIdx}
                            onChange={(e) =>
                              setColMap((m) => ({
                                ...m,
                                [f.key]: parseInt(e.target.value),
                              }))
                            }
                            className={cn(
                              "h-8 rounded-md border bg-transparent px-2 py-1 text-xs shadow-sm transition-colors",
                              "focus:outline-none focus:ring-1 focus:ring-ring",
                              isDetected
                                ? "border-emerald-500/50 text-foreground"
                                : "border-border text-muted-foreground",
                            )}
                          >
                            <option value={-1}>— nicht zuordnen —</option>
                            {headers.map((h, i) => (
                              <option key={i} value={i}>
                                {h}
                              </option>
                            ))}
                          </select>
                          {isDetected && (
                            <span className="text-[10px] text-emerald-400 font-medium">
                              ✓ erkannt
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {/* Status-Spalte separat (für Filter) */}
                <tr className="hover:bg-muted/10 transition-colors">
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-xs">Status</span>
                    <p className="text-[10px] text-muted-foreground/60">für Filter</p>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    Nur bezahlte Zeilen importieren
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <select
                        value={colMap.status}
                        onChange={(e) =>
                          setColMap((m) => ({
                            ...m,
                            status: parseInt(e.target.value),
                          }))
                        }
                        className={cn(
                          "h-8 rounded-md border bg-transparent px-2 py-1 text-xs shadow-sm",
                          "focus:outline-none focus:ring-1 focus:ring-ring",
                          colMap.status >= 0
                            ? "border-emerald-500/50"
                            : "border-border text-muted-foreground",
                        )}
                      >
                        <option value={-1}>— kein Filter —</option>
                        {headers.map((h, i) => (
                          <option key={i} value={i}>
                            {h}
                          </option>
                        ))}
                      </select>
                      {colMap.status >= 0 && (
                        <span className="text-[10px] text-emerald-400 font-medium">
                          ✓ erkannt
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Vorschau der ersten 3 Zeilen */}
          {previewRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground font-medium">
                  Vorschau (erste {previewRows.length} Zeilen)
                </p>
              </div>
              <div className="rounded-lg border border-border overflow-x-auto">
                <table className="text-xs w-full">
                  <thead className="border-b border-border bg-muted/40">
                    <tr>
                      {["Kundenname", "Bestell-ID", "Produkt", "Preis", "Zahlung", "Datum"].map(
                        (h) => (
                          <th
                            key={h}
                            className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {previewRows.map((row, i) => {
                      const get = (idx: number) =>
                        idx >= 0 ? (row[idx]?.trim() ?? "—") : "—";
                      let name: string;
                      if (customerNameMode === "split") {
                        const first = get(colMap.customerFirst);
                        const last = get(colMap.customerLast);
                        name = [first, last].filter((v) => v !== "—").join(" ") || "—";
                      } else {
                        name = get(colMap.customerFirst);
                      }
                      const price = get(colMap.totalPrice);
                      const parsedPrice = parseGermanPrice(price);
                      return (
                        <tr key={i} className="hover:bg-muted/10">
                          <td className="px-3 py-1.5 whitespace-nowrap font-medium">
                            {name}
                          </td>
                          <td className="px-3 py-1.5 font-mono text-muted-foreground text-[10px]">
                            {get(colMap.orderId)}
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground max-w-[120px] truncate">
                            {get(colMap.product)}
                          </td>
                          <td className="px-3 py-1.5 tabular-nums">
                            {parsedPrice > 0 ? fmt.format(parsedPrice) : price}
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground">
                            {formatPaymentType(
                              normalizePaymentType(get(colMap.paymentType)),
                            )}
                          </td>
                          <td className="px-3 py-1.5 tabular-nums text-muted-foreground">
                            {get(colMap.date)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {parseError && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              {parseError}
            </div>
          )}

          <div className="flex gap-3">
            <Button onClick={applyMapping} className="gap-2">
              Zeilen prüfen & bearbeiten
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={() => setStep("upload")}>
              ← Zurück
            </Button>
          </div>
        </div>
      )}

      {/* ── Schritt 3: Zeilen prüfen & bearbeiten ─────────────────────────── */}
      {step === "edit" && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold">
                {editableRows.length} Zeilen zur Prüfung
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Daten direkt bearbeiten oder fehlerhafte Zeilen entfernen.
              </p>
            </div>
            <button
              onClick={() => setStep("mapping")}
              className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Zusammenfassung */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
              <p className="text-xs text-muted-foreground">Bereit</p>
              <p className="text-xl font-semibold text-emerald-400">{readyRows.length}</p>
            </div>
            <div
              className={cn(
                "rounded-lg border px-4 py-3",
                issueRows.length > 0
                  ? "border-amber-500/30 bg-amber-500/5"
                  : "border-border bg-muted/5",
              )}
            >
              <p className="text-xs text-muted-foreground">Mit Problemen</p>
              <p
                className={cn(
                  "text-xl font-semibold",
                  issueRows.length > 0 ? "text-amber-400" : "text-muted-foreground",
                )}
              >
                {issueRows.length}
              </p>
            </div>
          </div>

          {issueRows.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <p>
                {issueRows.length}{" "}
                {issueRows.length === 1 ? "Zeile hat Probleme" : "Zeilen haben Probleme"}{" "}
                — bitte korrigieren oder entfernen. Zeilen mit Problemen werden beim Import
                übersprungen.
              </p>
            </div>
          )}

          {/* Produkt-Zuordnung (Smart Import) */}
          <ProductMappingStep
            candidates={productCandidates}
            results={productResults}
            mappings={productMappings}
            onMap={handleProductMap}
            onCreated={handleProductCreated}
          />

          {/* Editierbare Tabelle */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-border bg-muted/40">
                  <tr>
                    <th className="px-2 py-2.5 text-left font-medium text-muted-foreground">
                      #
                    </th>
                    <th className="px-2 py-2.5 text-left font-medium text-muted-foreground min-w-[140px]">
                      Kundenname <span className="text-destructive">*</span>
                    </th>
                    <th className="px-2 py-2.5 text-left font-medium text-muted-foreground min-w-[120px]">
                      Bestell-ID <span className="text-destructive">*</span>
                    </th>
                    <th className="px-2 py-2.5 text-left font-medium text-muted-foreground min-w-[120px]">
                      Produkt
                    </th>
                    <th className="px-2 py-2.5 text-left font-medium text-muted-foreground min-w-[90px]">
                      Preis (€) <span className="text-destructive">*</span>
                    </th>
                    <th className="px-2 py-2.5 text-left font-medium text-muted-foreground min-w-[110px]">
                      Zahlung <span className="text-destructive">*</span>
                    </th>
                    <th className="px-2 py-2.5 text-left font-medium text-muted-foreground min-w-[110px]">
                      Datum <span className="text-destructive">*</span>
                    </th>
                    <th className="px-2 py-2.5 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {editableRows.map((row, i) => {
                    const issues = getIssues(row);
                    const hasIssue = issues.length > 0;
                    return (
                      <tr
                        key={row._id}
                        className={cn(
                          "transition-colors",
                          hasIssue
                            ? "bg-amber-500/5 hover:bg-amber-500/10"
                            : "hover:bg-muted/10",
                        )}
                      >
                        <td className="px-2 py-1.5 text-muted-foreground tabular-nums">
                          {i + 1}
                          {hasIssue && (
                            <AlertTriangle className="h-3 w-3 text-amber-400 inline ml-1" />
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={row.customer_name}
                            onChange={(e) =>
                              updateRow(row._id, "customer_name", e.target.value)
                            }
                            className={cn(
                              "w-full rounded border px-2 py-1 bg-transparent text-xs",
                              "focus:outline-none focus:ring-1 focus:ring-ring",
                              !row.customer_name.trim()
                                ? "border-amber-500/60"
                                : "border-border",
                            )}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={row.order_id}
                            onChange={(e) =>
                              updateRow(row._id, "order_id", e.target.value)
                            }
                            className={cn(
                              "w-full rounded border px-2 py-1 bg-transparent text-xs font-mono",
                              "focus:outline-none focus:ring-1 focus:ring-ring",
                              !row.order_id.trim()
                                ? "border-amber-500/60"
                                : "border-border",
                            )}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={row.product_name}
                            onChange={(e) =>
                              updateRow(row._id, "product_name", e.target.value)
                            }
                            className="w-full rounded border border-border px-2 py-1 bg-transparent text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={row.total_price}
                            onChange={(e) =>
                              updateRow(row._id, "total_price", e.target.value)
                            }
                            className={cn(
                              "w-full rounded border px-2 py-1 bg-transparent text-xs tabular-nums",
                              "focus:outline-none focus:ring-1 focus:ring-ring",
                              parseGermanPrice(row.total_price) <= 0 && row.total_price
                                ? "border-amber-500/60"
                                : !row.total_price.trim()
                                  ? "border-amber-500/60"
                                  : "border-border",
                            )}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            value={row.payment_type}
                            onChange={(e) =>
                              updateRow(row._id, "payment_type", e.target.value)
                            }
                            className="w-full rounded border border-border px-2 py-1 bg-transparent text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                          >
                            <option value="one_time">Einmalzahlung</option>
                            <option value="installments">Ratenzahlung</option>
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={row.close_date}
                            onChange={(e) =>
                              updateRow(row._id, "close_date", e.target.value)
                            }
                            placeholder="TT.MM.JJJJ"
                            className={cn(
                              "w-full rounded border px-2 py-1 bg-transparent text-xs tabular-nums",
                              "focus:outline-none focus:ring-1 focus:ring-ring",
                              !row.close_date.trim()
                                ? "border-amber-500/60"
                                : "border-border",
                            )}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <button
                            onClick={() => removeRow(row._id)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                            title="Zeile entfernen"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-3 items-center flex-wrap">
            <Button
              onClick={handleImport}
              disabled={importing || readyRows.length === 0}
              className="gap-2"
            >
              {importing
                ? "Wird importiert…"
                : `${readyRows.length} ${readyRows.length === 1 ? "Deal" : "Deals"} importieren`}
            </Button>
            {issueRows.length > 0 && (
              <p className="text-xs text-amber-400">
                {issueRows.length} fehlerhafte{" "}
                {issueRows.length === 1 ? "Zeile" : "Zeilen"} werden übersprungen
              </p>
            )}
            <Button variant="outline" onClick={() => setStep("mapping")}>
              ← Zurück
            </Button>
          </div>
        </div>
      )}

      {/* ── Schritt 4: Ergebnis ───────────────────────────────────────────── */}
      {step === "done" && result && (
        <div className="space-y-4">
          <div
            className={cn(
              "rounded-xl border p-5 space-y-4",
              result.errors.length > 0
                ? "border-rose-500/40 bg-rose-500/5"
                : "border-emerald-500/40 bg-emerald-500/5",
            )}
          >
            <div className="flex items-center gap-3">
              {result.errors.length > 0 ? (
                <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0" />
              ) : (
                <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0" />
              )}
              <div>
                <p className="font-semibold">Import abgeschlossen</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {platformLabel} · {fileName}
                </p>
              </div>
            </div>

            {/* Ergebnis-Zahlen */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
                <p className="text-xs text-muted-foreground">Angelegt</p>
                <p className="text-lg font-semibold text-emerald-400">{result.imported}</p>
              </div>
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2">
                <p className="text-xs text-muted-foreground">Aktualisiert</p>
                <p className="text-lg font-semibold text-blue-400">{result.updated}</p>
              </div>
              <div className="rounded-lg border border-muted px-3 py-2">
                <p className="text-xs text-muted-foreground">Übersprungen</p>
                <p className="text-lg font-semibold text-muted-foreground">{result.skipped}</p>
              </div>
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2">
                <p className="text-xs text-muted-foreground">Fehler</p>
                <p className="text-lg font-semibold text-rose-400">{result.errors.length}</p>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-rose-400">Fehlerdetails:</p>
                <ul className="space-y-0.5">
                  {result.errors.slice(0, 8).map((e, i) => (
                    <li key={i} className="text-xs text-rose-400/80">
                      • {e}
                    </li>
                  ))}
                  {result.errors.length > 8 && (
                    <li className="text-xs text-rose-400/60">
                      + {result.errors.length - 8} weitere…
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>

          <div className="flex gap-3 flex-wrap">
            <Button variant="outline" onClick={fullReset}>
              Weiteren Import starten
            </Button>
            {(result.imported > 0 || result.updated > 0) && (
              <Link
                href="/deals"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Deals ansehen →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

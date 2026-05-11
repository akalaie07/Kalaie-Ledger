"use client";

import { useRef, useState, useTransition } from "react";
import {
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle,
  X,
  Eye,
  PlusCircle,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import { previewImport } from "@/lib/actions/import-preview";
import { executeImport } from "@/lib/actions/import-execute";
import { saveConflicts, type ImportConflict } from "@/lib/actions/import-conflicts";
import {
  parseCopecartExport,
  parseAblefyExport,
  parseDigistoreExport,
} from "@/lib/import";
import type { NormalizedImportRow, PreviewItem, PreviewClassification } from "@/lib/import";
import { Button } from "@/components/ui/button";
import { ConflictResolver } from "./conflict-resolver";
import Link from "next/link";
import { cn } from "@/lib/utils";

// =============================================================================
// Typen
// =============================================================================

type PlatformFormat = "copecart" | "digistore" | "ablefy";

type FileEntry = {
  name: string;
  format: PlatformFormat;
  normalized: NormalizedImportRow[];
};

// =============================================================================
// Format-Erkennung
// =============================================================================

function detectFormat(
  headers: string[],
  delimiter: string,
): PlatformFormat | null {
  const h = headers.map((x) => x.toLowerCase().trim());
  if (delimiter === "," && h.some((x) => x === "kundenname")) return "copecart";
  if (h.some((x) => x === "trx-id")) return "ablefy";
  if (h.some((x) => x === "zahlungsstatus")) return "digistore";
  return null;
}

function parsePlatformCsv(text: string): { format: PlatformFormat; normalized: NormalizedImportRow[] } | string {
  const firstLine = text.split("\n")[0] ?? "";
  const delimiter = firstLine.includes(";") ? ";" : ",";
  const headers = firstLine.split(delimiter).map((h) => h.replace(/^"|"$/g, "").trim());
  const format = detectFormat(headers, delimiter);

  if (!format) {
    return "Unbekanntes Format — bitte eine Copecart-, Digistore- oder Ablefy-CSV hochladen.";
  }

  let normalized: NormalizedImportRow[] = [];
  if (format === "copecart") normalized = parseCopecartExport(text);
  else if (format === "ablefy") normalized = parseAblefyExport(text);
  else if (format === "digistore") normalized = parseDigistoreExport(text);

  if (normalized.length === 0) {
    return `Keine Transaktionen in der ${format}-Datei gefunden.`;
  }

  return { format, normalized };
}

// =============================================================================
// Klassifikations-Gruppen
// =============================================================================

const MANUAL_ACTIONS = new Set([
  "needs_review",
  "mark_failed",
  "mark_chargeback",
  "mark_chargeback_reversal",
  "mark_refunded",
]);

const SKIP_ACTIONS = new Set(["skip_already_paid", "skip_no_match"]);

function groupItems(items: PreviewItem[]) {
  const autoImport = items.filter(
    (i) =>
      (i.classification === "safe" || i.classification === "warning") &&
      !MANUAL_ACTIONS.has(i.action),
  );
  const needsDecision = items.filter(
    (i) => i.classification === "conflict" || MANUAL_ACTIONS.has(i.action),
  );
  const skipped = items.filter((i) => SKIP_ACTIONS.has(i.action));
  const errors = items.filter((i) => i.classification === "error");
  return { autoImport, needsDecision, skipped, errors };
}

// =============================================================================
// UI-Helfer
// =============================================================================

const FORMAT_COLOR: Record<PlatformFormat, string> = {
  copecart: "bg-purple-500/15 text-purple-400",
  digistore: "bg-amber-500/15 text-amber-400",
  ablefy: "bg-cyan-500/15 text-cyan-400",
};

const FORMAT_LABEL: Record<PlatformFormat, string> = {
  copecart: "Copecart",
  digistore: "Digistore",
  ablefy: "Ablefy",
};

const EVENT_BADGE: Record<string, string> = {
  payment_paid: "bg-emerald-500/15 text-emerald-400",
  payment_pending: "bg-muted text-muted-foreground",
  payment_failed: "bg-rose-500/15 text-rose-400",
  refund: "bg-amber-500/15 text-amber-400",
  chargeback: "bg-orange-500/15 text-orange-400",
  chargeback_reversal: "bg-blue-500/15 text-blue-400",
};
const EVENT_LABEL: Record<string, string> = {
  payment_paid: "Bezahlt",
  payment_pending: "Ausstehend",
  payment_failed: "Fehlgeschlagen",
  refund: "Erstattung",
  chargeback: "Rückbuchung",
  chargeback_reversal: "RB-Storno",
};

const CLASS_COLOR: Record<PreviewClassification, string> = {
  safe: "border-l-emerald-500 bg-emerald-500/5",
  warning: "border-l-amber-500 bg-amber-500/5",
  conflict: "border-l-orange-500 bg-orange-500/5",
  error: "border-l-red-500 bg-red-500/5",
};
const CLASS_BADGE: Record<PreviewClassification, string> = {
  safe: "bg-emerald-500/15 text-emerald-400",
  warning: "bg-amber-500/15 text-amber-400",
  conflict: "bg-orange-500/15 text-orange-400",
  error: "bg-red-500/15 text-red-400",
};
const CLASS_LABEL: Record<PreviewClassification, string> = {
  safe: "Sicher",
  warning: "Hinweis",
  conflict: "Konflikt",
  error: "Fehler",
};

// =============================================================================
// Preview-Row Komponente
// =============================================================================

function PreviewRow({ item }: { item: PreviewItem }) {
  const [exp, setExp] = useState(false);
  const n = item.normalized;
  const fmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: n.currency || "EUR" });
  const hasDetails = item.warnings.length > 0 || item.conflicts.length > 0 || item.suggestedDeals.length > 0;

  return (
    <div className={cn("border-l-2 rounded-r-md px-3 py-2 text-xs", CLASS_COLOR[item.classification])}>
      <div className="flex items-start gap-2 flex-wrap">
        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0", CLASS_BADGE[item.classification])}>
          {CLASS_LABEL[item.classification]}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{n.customerName}</p>
          <p className="text-muted-foreground font-mono text-[10px]">{n.externalOrderId}</p>
        </div>
        <div className="flex-[2] min-w-0">
          <p className="font-medium">{item.actionLabel}</p>
          <p className="text-muted-foreground">{item.reason}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", EVENT_BADGE[n.eventType] ?? "bg-muted text-muted-foreground")}>
            {EVENT_LABEL[n.eventType] ?? n.eventType}
          </span>
          {n.amount > 0 && <span className="tabular-nums text-muted-foreground">{fmt.format(n.amount)}</span>}
        </div>
        {hasDetails && (
          <button onClick={() => setExp((v) => !v)} className="text-muted-foreground hover:text-foreground shrink-0">
            {exp ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {exp && (
        <div className="mt-2 pl-2 border-l border-border space-y-1.5">
          {item.conflicts.map((c, i) => <p key={i} className="text-orange-400/80 text-[10px]">⚡ {c}</p>)}
          {item.warnings.map((w, i) => <p key={i} className="text-amber-400/80 text-[10px]">⚠ {w}</p>)}
          {item.suggestedDeals.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground font-medium">Mögliche Deals:</p>
              {item.suggestedDeals.map((s) => (
                <p key={s.dealId} className="text-[10px] text-muted-foreground/70">
                  • {s.dealCustomerName} ({Math.round(s.score * 100)}%) — {s.reasons.join(", ")}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Gruppen-Abschnitt
// =============================================================================

function GroupSection({
  title,
  color,
  items,
  defaultCollapsed = false,
}: {
  title: string;
  color: string;
  items: PreviewItem[];
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  if (items.length === 0) return null;

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/20 text-sm font-medium hover:bg-muted/30 transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className={cn("rounded-full w-2 h-2 shrink-0", color)} />
          {title}
          <span className="text-muted-foreground font-normal">({items.length})</span>
        </span>
        {collapsed ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {!collapsed && (
        <div className="p-2 space-y-1.5 max-h-72 overflow-y-auto">
          {items.map((item) => <PreviewRow key={item.syntheticKey} item={item} />)}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Haupt-Komponente
// =============================================================================

type WizardStep = "upload" | "preview" | "done";

type DoneState = {
  created: number;
  paid: number;
  installmentsCreated: number;
  skipped: number;
  errors: string[];
  batchId: string | null;
  savedConflicts: ImportConflict[];
};

export function ZahlungsabgleichWizard({
  initialConflicts = [],
}: {
  initialConflicts?: ImportConflict[];
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<WizardStep>("upload");
  const [fileEntries, setFileEntries] = useState<FileEntry[]>([]);
  const [parseErrors, setParseErrors] = useState<{ name: string; msg: string }[]>([]);
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
  const [doneState, setDoneState] = useState<DoneState | null>(null);
  const [openConflicts, setOpenConflicts] = useState<ImportConflict[]>(initialConflicts);

  const [previewPending, startPreviewTransition] = useTransition();
  const [importPending, startImportTransition] = useTransition();

  const fmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

  // ── Datei verarbeiten ────────────────────────────────────────────────────────
  function processFile(file: File): Promise<{ entry: FileEntry | null; error: { name: string; msg: string } | null }> {
    return new Promise((resolve) => {
      if (!file.name.endsWith(".csv")) {
        resolve({ entry: null, error: { name: file.name, msg: "Nur CSV-Dateien werden unterstützt. XLSX-Dateien bitte unter 'Alte Buchhaltung importieren' hochladen." } });
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = parsePlatformCsv(e.target!.result as string);
        if (typeof result === "string") {
          resolve({ entry: null, error: { name: file.name, msg: result } });
        } else {
          resolve({ entry: { name: file.name, format: result.format, normalized: result.normalized }, error: null });
        }
      };
      reader.readAsText(file, "utf-8");
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

  // ── Vorschau laden ───────────────────────────────────────────────────────────
  function handleLoadPreview() {
    const allNormalized = fileEntries.flatMap((e) => e.normalized);
    if (allNormalized.length === 0) return;
    startPreviewTransition(async () => {
      const items = await previewImport(allNormalized);
      setPreviewItems(items);
      setStep("preview");
    });
  }

  // ── Import starten ───────────────────────────────────────────────────────────
  function handleImport() {
    const groups = groupItems(previewItems);
    const filename = fileEntries.map((e) => e.name).join(", ");

    startImportTransition(async () => {
      // Nur sichere + Warnung-Items importieren
      const result = groups.autoImport.length > 0
        ? await executeImport(groups.autoImport, filename)
        : { batchId: null, created: 0, paid: 0, installmentsCreated: 0, skipped: 0, reviewNeeded: 0, errors: [], reviewItems: [] };

      // Konflikte speichern (falls vorhanden + batchId vorhanden)
      let savedConflicts: ImportConflict[] = [];
      if (groups.needsDecision.length > 0) {
        if (result.batchId) {
          await saveConflicts(result.batchId, groups.needsDecision);
        }
        // Für sofortige UI-Anzeige: als ImportConflict-ähnliche Objekte aus den Preview-Items ableiten
        savedConflicts = groups.needsDecision.map((item) => ({
          id: item.syntheticKey, // temporäre ID — wird nach Reload durch echte DB-ID ersetzt
          batchId: result.batchId ?? "",
          rowNumber: item.rowNumber,
          syntheticKey: item.syntheticKey,
          action: item.action,
          reason: item.reason,
          normalized: item.normalized,
          suggestedDeals: item.suggestedDeals,
          status: "pending" as const,
          resolvedDealId: null,
          createdAt: new Date().toISOString(),
        }));
        setOpenConflicts((prev) => [...savedConflicts, ...prev]);
      }

      setDoneState({
        created: result.created,
        paid: result.paid,
        installmentsCreated: result.installmentsCreated,
        skipped: result.skipped + groups.skipped.length,
        errors: result.errors,
        batchId: result.batchId,
        savedConflicts,
      });
      setStep("done");
      setFileEntries([]);
    });
  }

  function fullReset() {
    setFileEntries([]);
    setParseErrors([]);
    setPreviewItems([]);
    setDoneState(null);
    setStep("upload");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const groups = step === "preview" ? groupItems(previewItems) : null;

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="space-y-6">

      {/* Bestehende offene Konflikte (aus vergangenen Importen) */}
      {step === "upload" && openConflicts.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <ConflictResolver conflicts={openConflicts} />
        </div>
      )}

      {/* ── Schritt 1: Upload ─────────────────────────────────────────────── */}
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
                {fileEntries.length > 0 ? "Weitere Datei hinzufügen" : "Plattform-Export hochladen"}
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                CSV-Export von Copecart, Digistore oder Ablefy — mehrere Dateien gleichzeitig möglich
              </p>
            </div>
            <div className="flex justify-center gap-2">
              {(["Copecart", "Digistore", "Ablefy"] as const).map((p) => (
                <span key={p} className="rounded-full border border-border px-2 py-0.5 text-xs">
                  {p}
                </span>
              ))}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
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
              {fileEntries.map((entry) => {
                const paidCount = entry.normalized.filter((r) => r.eventType === "payment_paid").length;
                const refundCount = entry.normalized.filter((r) => r.eventType === "refund").length;
                const failedCount = entry.normalized.filter((r) => r.eventType === "payment_failed" || r.eventType === "chargeback").length;

                return (
                  <div key={entry.name} className="rounded-lg border border-border overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-muted/20 border-b border-border">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium">{entry.name}</span>
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", FORMAT_COLOR[entry.format])}>
                          {FORMAT_LABEL[entry.format]}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {[
                            `${entry.normalized.length} Transaktionen`,
                            `${paidCount} bezahlt`,
                            ...(refundCount > 0 ? [`${refundCount} erstattet`] : []),
                            ...(failedCount > 0 ? [`${failedCount} fehlgeschlagen`] : []),
                          ].join(" · ")}
                        </span>
                      </div>
                      <button onClick={() => setFileEntries((p) => p.filter((e) => e.name !== entry.name))} className="text-muted-foreground hover:text-foreground">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="overflow-auto max-h-40">
                      <table className="w-full text-xs">
                        <thead className="border-b border-border bg-muted/20 sticky top-0">
                          <tr>
                            {["Bestell-ID", "Kunde", "Betrag", "Event", "Rate", "Warnungen"].map((h) => (
                              <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {entry.normalized.slice(0, 12).map((r, i) => (
                            <tr key={i} className={cn(r.eventType !== "payment_paid" && "opacity-40")}>
                              <td className="px-3 py-1.5 font-mono text-muted-foreground text-[10px]">{r.externalOrderId}</td>
                              <td className="px-3 py-1.5 whitespace-nowrap">{r.customerName}</td>
                              <td className="px-3 py-1.5 tabular-nums">{r.amount > 0 ? fmt.format(r.amount) : "—"}</td>
                              <td className="px-3 py-1.5">
                                <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium", EVENT_BADGE[r.eventType] ?? "bg-muted text-muted-foreground")}>
                                  {EVENT_LABEL[r.eventType] ?? r.eventType}
                                </span>
                              </td>
                              <td className="px-3 py-1.5 text-muted-foreground">{r.installmentSequence ? `Rate ${r.installmentSequence}` : "—"}</td>
                              <td className="px-3 py-1.5 text-amber-400/70 text-[10px]">{r.warnings.length > 0 ? `${r.warnings.length} ⚠` : ""}</td>
                            </tr>
                          ))}
                          {entry.normalized.length > 12 && (
                            <tr><td colSpan={6} className="px-3 py-2 text-center text-muted-foreground">+ {entry.normalized.length - 12} weitere…</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}

              <div className="flex gap-3 pt-1">
                <Button onClick={handleLoadPreview} disabled={previewPending}>
                  <Eye className="h-4 w-4 mr-1.5" />
                  {previewPending ? "Vorschau wird geladen…" : "Vorschau laden"}
                </Button>
                <Button variant="outline" onClick={fullReset}>Abbrechen</Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Schritt 2: Preview ────────────────────────────────────────────── */}
      {step === "preview" && groups && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold">Vorschau — {previewItems.length} Einträge analysiert</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Noch kein Schreiben in die Datenbank.
              </p>
            </div>
            <button onClick={fullReset} className="text-muted-foreground hover:text-foreground shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Zusammenfassung */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
              <p className="text-xs text-muted-foreground">Sicher importierbar</p>
              <p className="text-lg font-semibold text-emerald-400">{groups.autoImport.length}</p>
              <p className="text-[10px] text-muted-foreground">werden sofort verarbeitet</p>
            </div>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
              <p className="text-xs text-muted-foreground">Braucht Entscheidung</p>
              <p className="text-lg font-semibold text-amber-400">{groups.needsDecision.length}</p>
              <p className="text-[10px] text-muted-foreground">werden zur Klärung gespeichert</p>
            </div>
            <div className="rounded-lg border border-muted px-3 py-2">
              <p className="text-xs text-muted-foreground">Wird übersprungen</p>
              <p className="text-lg font-semibold text-muted-foreground">{groups.skipped.length}</p>
              <p className="text-[10px] text-muted-foreground">bereits bezahlt / kein Match</p>
            </div>
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2">
              <p className="text-xs text-muted-foreground">Fehler</p>
              <p className="text-lg font-semibold text-rose-400">{groups.errors.length}</p>
              <p className="text-[10px] text-muted-foreground">werden protokolliert</p>
            </div>
          </div>

          {/* Digistore Hinweis */}
          {previewItems.some((i) => i.normalized.source === "digistore") && (
            <div className="flex items-start gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-400">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <p>Digistore-Exporte sind Order-Snapshots, keine Transaktionslisten. Einzelne Raten werden nur markiert wenn der Status eindeutig ist.</p>
            </div>
          )}

          {/* Gruppen-Abschnitte */}
          <div className="space-y-2">
            <GroupSection
              title="Sicher importierbar"
              color="bg-emerald-500"
              items={groups.autoImport}
            />
            <GroupSection
              title="Braucht Entscheidung"
              color="bg-amber-500"
              items={groups.needsDecision}
            />
            <GroupSection
              title="Wird übersprungen"
              color="bg-muted-foreground"
              items={groups.skipped}
              defaultCollapsed
            />
            <GroupSection
              title="Fehler"
              color="bg-rose-500"
              items={groups.errors}
              defaultCollapsed
            />
          </div>

          {/* Aktions-Buttons */}
          <div className="flex gap-3 pt-2 flex-wrap">
            <Button
              onClick={handleImport}
              disabled={importPending || groups.autoImport.length === 0}
            >
              {importPending
                ? "Wird importiert…"
                : groups.needsDecision.length > 0
                ? `${groups.autoImport.length} importieren · ${groups.needsDecision.length} zur Klärung`
                : `${groups.autoImport.length} Einträge importieren`}
            </Button>
            <Button variant="outline" onClick={() => setStep("upload")}>
              ← Zurück
            </Button>
          </div>
        </div>
      )}

      {/* ── Schritt 3: Ergebnis ───────────────────────────────────────────── */}
      {step === "done" && doneState && (
        <div className="space-y-4">
          <div className={cn(
            "rounded-lg border p-4 space-y-3",
            doneState.errors.length > 0
              ? "border-rose-500/40 bg-rose-500/10"
              : doneState.savedConflicts.length > 0
              ? "border-amber-500/40 bg-amber-500/10"
              : "border-emerald-500/40 bg-emerald-500/10",
          )}>
            <div className="flex items-center gap-2">
              {doneState.errors.length > 0
                ? <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
                : doneState.savedConflicts.length > 0
                ? <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                : <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />}
              <span className="text-sm font-semibold">Zahlungsabgleich abgeschlossen</span>
            </div>

            <p className="text-sm font-medium">
              {(() => {
                const parts: string[] = [];
                if (doneState.created > 0) parts.push(`${doneState.created} Deal(s) angelegt`);
                if (doneState.paid > 0) parts.push(`${doneState.paid} Zahlung(en) markiert`);
                if (doneState.installmentsCreated > 0) parts.push(`${doneState.installmentsCreated} Rate(n) angelegt`);
                if (doneState.skipped > 0) parts.push(`${doneState.skipped} übersprungen`);
                if (doneState.savedConflicts.length > 0) parts.push(`${doneState.savedConflicts.length} zur Klärung`);
                return parts.length > 0 ? parts.join(" · ") : "Keine Änderungen.";
              })()}
            </p>

            {doneState.created > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2">
                <PlusCircle className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-400">
                  {doneState.created} Deal(s) angelegt.{" "}
                  <Link href="/deals" className="underline underline-offset-2 hover:text-blue-300">
                    Zu den Deals →
                  </Link>
                </p>
              </div>
            )}

            {doneState.errors.length > 0 && (
              <ul className="space-y-0.5 text-xs text-rose-400/80">
                {doneState.errors.slice(0, 5).map((e, i) => <li key={i}>• {e}</li>)}
                {doneState.errors.length > 5 && <li>+ {doneState.errors.length - 5} weitere…</li>}
              </ul>
            )}
          </div>

          {/* Inline-Klärung für neue Konflikte */}
          {doneState.savedConflicts.length > 0 && (
            <ConflictResolver conflicts={doneState.savedConflicts} />
          )}

          <Button variant="outline" onClick={fullReset}>
            Weiteren Import starten
          </Button>
        </div>
      )}
    </div>
  );
}

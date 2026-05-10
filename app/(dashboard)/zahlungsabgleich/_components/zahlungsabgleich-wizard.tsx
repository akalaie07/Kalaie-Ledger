"use client";

import { useRef, useState, useTransition } from "react";
import { Upload, FileText, AlertTriangle, CheckCircle, X } from "lucide-react";

import {
  processZahlungsabgleich,
  type AbgleichRow,
  type AbgleichResult,
} from "@/lib/actions/zahlungsabgleich";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Proper quoted-field CSV parser ──────────────────────────────────────────

function parseLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      result.push(field.trim());
      field = "";
    } else {
      field += ch;
    }
  }
  result.push(field.trim());
  return result;
}

// ─── Platform detection ───────────────────────────────────────────────────────

type Platform = "copecart" | "digistore" | "ablefy";

function detectPlatform(headers: string[]): Platform | null {
  const h = headers.map((x) => x.toLowerCase().trim());
  // Copecart: comma-separated, unique column "transaktionsstatus"
  if (h.some((x) => x === "transaktionsstatus")) return "copecart";
  // Digistore: semicolon-separated, unique column "zahlungsnr."
  if (h.some((x) => x.startsWith("zahlungsnr"))) return "digistore";
  // Ablefy: headers use ae/oe/ue for umlauts, unique column "zahlungsplan"
  if (h.some((x) => x === "zahlungsplan")) return "ablefy";
  return null;
}

// ─── Copecart parser ──────────────────────────────────────────────────────────

function parseCopecart(text: string): AbgleichRow[] {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseLine(lines[0], ",");
  const idxId = headers.findIndex((h) => h.toLowerCase() === "bestell-id");
  const idxStatus = headers.findIndex((h) => h.toLowerCase() === "transaktionsstatus");
  if (idxId < 0 || idxStatus < 0) return [];

  const rows: AbgleichRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = parseLine(line, ",");
    const orderId = cols[idxId];
    const status = (cols[idxStatus] ?? "").toLowerCase();
    if (!orderId) continue;

    const isPaid = status.includes("bezahlt");
    const isRefunded = status.includes("erstattet");
    rows.push({
      order_id: orderId,
      platform: "copecart",
      status: isPaid ? "paid" : isRefunded ? "refunded" : "failed",
    });
  }
  return rows;
}

// ─── Digistore parser ─────────────────────────────────────────────────────────

function parseDigistore(text: string): AbgleichRow[] {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseLine(lines[0], ";");
  const idxId = headers.findIndex((h) => h.toLowerCase() === "bestell-id");
  const idxNr = headers.findIndex((h) => h.toLowerCase().startsWith("zahlungsnr"));
  const idxType = headers.findIndex((h) => h.toLowerCase() === "transaktionstyp");
  if (idxId < 0) return [];

  const rows: AbgleichRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = parseLine(line, ";");
    const orderId = cols[idxId];
    if (!orderId) continue;

    // Only process actual payments, skip refunds/chargebacks
    const txType = (cols[idxType] ?? "").toLowerCase();
    if (txType && !txType.includes("zahlung")) continue;

    const nr = idxNr >= 0 ? parseInt(cols[idxNr] ?? "1", 10) : undefined;
    rows.push({
      order_id: orderId,
      platform: "digistore",
      status: "paid",
      installment_sequence: nr && !isNaN(nr) ? nr : undefined,
    });
  }
  return rows;
}

// ─── Ablefy parser ────────────────────────────────────────────────────────────
// Ablefy exports umlauts as ae/oe/ue (e.g. FAeLLIGKEITEN, WAeHRUNG)

function parseAblefy(text: string): AbgleichRow[] {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseLine(lines[0], ";");
  const norm = (s: string) => s.toLowerCase().trim();

  const idxId = headers.findIndex((h) => norm(h).replace(/[- ]/g, "") === "bestellid");
  const idxStatus = headers.findIndex((h) => norm(h) === "status");
  // FAeLLIGKEITEN ID header uses ae for ä
  const idxFaellig = headers.findIndex((h) => {
    const l = norm(h);
    return l.includes("faelligkeiten") || l.includes("fälligkeiten");
  });

  if (idxId < 0) return [];

  const seqMap = new Map<string, number>();
  const rows: AbgleichRow[] = [];

  for (const line of lines.slice(1)) {
    const cols = parseLine(line, ";");
    const orderId = cols[idxId];
    if (!orderId) continue;

    const status = norm(cols[idxStatus] ?? "");
    const isPaid = status.includes("erfolgreich");
    const isFailed = status.includes("abgelaufen") || status.includes("failed");

    const seq = (seqMap.get(orderId) ?? 0) + 1;
    seqMap.set(orderId, seq);

    rows.push({
      order_id: orderId,
      platform: "ablefy",
      status: isFailed ? "failed" : isPaid ? "paid" : "failed",
      installment_sequence: idxFaellig >= 0 ? seq : undefined,
    });
  }
  return rows;
}

// ─── File parser entry point ──────────────────────────────────────────────────

type ParsedFile = { rows: AbgleichRow[]; platform: Platform };

function parseCsvFile(text: string): ParsedFile | string {
  // Detect delimiter from first line
  const firstLine = text.split("\n")[0] ?? "";
  const delimiter = firstLine.includes(";") ? ";" : ",";
  const headers = parseLine(firstLine, delimiter);

  const platform = detectPlatform(headers);
  if (!platform) {
    return "Plattform nicht erkannt. Bitte prüfe, ob die Datei von Copecart, Digistore oder Ablefy stammt.";
  }

  let rows: AbgleichRow[] = [];
  if (platform === "copecart") rows = parseCopecart(text);
  else if (platform === "digistore") rows = parseDigistore(text);
  else if (platform === "ablefy") rows = parseAblefy(text);

  if (rows.length === 0) return "Keine Transaktionen in der Datei gefunden.";
  return { rows, platform };
}

// ─── Component ────────────────────────────────────────────────────────────────

const PLATFORM_LABEL: Record<Platform, string> = {
  copecart: "Copecart",
  digistore: "Digistore",
  ablefy: "Ablefy",
};

const PLATFORM_COLOR: Record<Platform, string> = {
  copecart: "bg-blue-500/15 text-blue-400",
  digistore: "bg-purple-500/15 text-purple-400",
  ablefy: "bg-emerald-500/15 text-emerald-400",
};

const STATUS_LABEL: Record<string, string> = {
  paid: "Bezahlt",
  refunded: "Erstattet",
  failed: "Übersprungen",
};

export function ZahlungsabgleichWizard() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<AbgleichRow[]>([]);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState("");
  const [result, setResult] = useState<AbgleichResult | null>(null);
  const [pending, startTransition] = useTransition();

  function handleFile(file: File) {
    setRows([]); setParseError(""); setPlatform(null); setResult(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target!.result as string;
      const parsed = parseCsvFile(text);
      if (typeof parsed === "string") { setParseError(parsed); return; }
      setRows(parsed.rows);
      setPlatform(parsed.platform);
    };
    reader.readAsText(file, "utf-8");
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleProcess() {
    startTransition(async () => {
      const res = await processZahlungsabgleich(rows);
      setResult(res);
      if (res.updated > 0) setRows([]);
    });
  }

  function fullReset() {
    setRows([]); setParseError(""); setPlatform(null); setFileName(""); setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const paidRows = rows.filter((r) => r.status === "paid");
  const skippedRows = rows.filter((r) => r.status !== "paid");

  return (
    <div className="space-y-6">
      {/* Info */}
      <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-2">
        <p className="text-sm font-medium">Wie es funktioniert</p>
        <p className="text-sm text-muted-foreground">
          Lade den CSV-Export von Copecart, Digistore oder Ablefy hoch. Die Transaktionen werden
          anhand der Bestell-ID mit deinen Deals abgeglichen und der Zahlungsstatus automatisch aktualisiert.
        </p>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border border-border px-2 py-0.5">Copecart CSV</span>
          <span className="rounded-full border border-border px-2 py-0.5">Digistore CSV</span>
          <span className="rounded-full border border-border px-2 py-0.5">Ablefy CSV</span>
        </div>
      </div>

      {/* Drop zone */}
      {rows.length === 0 && !result && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          className="rounded-lg border-2 border-dashed border-border bg-muted/10 px-8 py-12 text-center space-y-4 hover:border-border/80 cursor-pointer transition-colors"
        >
          <div className="flex justify-center">
            <div className="rounded-full bg-muted p-4">
              <Upload className="h-8 w-8 text-muted-foreground" />
            </div>
          </div>
          <div>
            <p className="font-medium">CSV-Export hochladen</p>
            <p className="text-sm text-muted-foreground mt-1">Klicken oder Datei hier ablegen</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
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

      {/* Preview */}
      {rows.length > 0 && platform && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{fileName}</span>
              <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", PLATFORM_COLOR[platform])}>
                {PLATFORM_LABEL[platform]}
              </span>
              <span className="text-sm text-muted-foreground">
                {rows.length} Transaktionen —{" "}
                <span className="text-emerald-400 font-medium">{paidRows.length} bezahlt</span>
                {skippedRows.length > 0 && <>, {skippedRows.length} übersprungen</>}
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
                {rows.slice(0, 20).map((r, i) => (
                  <tr key={i} className={cn(r.status !== "paid" && "opacity-40")}>
                    <td className="px-3 py-2 font-mono">{r.order_id}</td>
                    <td className="px-3 py-2">
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        r.status === "paid" ? "bg-emerald-500/15 text-emerald-400"
                          : r.status === "refunded" ? "bg-amber-500/15 text-amber-400"
                          : "bg-muted text-muted-foreground",
                      )}>
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.installment_sequence ? `Rate ${r.installment_sequence}` : "—"}
                    </td>
                  </tr>
                ))}
                {rows.length > 20 && (
                  <tr><td colSpan={3} className="px-3 py-2 text-center text-muted-foreground">+ {rows.length - 20} weitere…</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleProcess} disabled={pending || paidRows.length === 0}>
              {pending ? "Wird abgeglichen…" : `${paidRows.length} Zahlungen abgleichen`}
            </Button>
            <Button variant="outline" onClick={fullReset}>Abbrechen</Button>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-3">
          <div className={cn(
            "rounded-lg border p-4 space-y-3",
            result.errors.length === 0 && result.notFound.length === 0
              ? "border-emerald-500/40 bg-emerald-500/10"
              : "border-amber-500/40 bg-amber-500/10",
          )}>
            <div className="flex items-center gap-2">
              {result.errors.length === 0 && result.notFound.length === 0
                ? <CheckCircle className="h-4 w-4 text-emerald-400" />
                : <AlertTriangle className="h-4 w-4 text-amber-400" />}
              <span className="text-sm font-medium">
                {result.updated} Zahlungen aktualisiert
                {result.skipped > 0 && `, ${result.skipped} übersprungen`}
              </span>
            </div>
            {result.notFound.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-amber-400">Bestell-IDs nicht in Deals gefunden:</p>
                <ul className="space-y-0.5 text-xs text-amber-400/80">
                  {result.notFound.map((id) => <li key={id} className="font-mono">• {id}</li>)}
                </ul>
              </div>
            )}
            {result.errors.length > 0 && (
              <ul className="space-y-1 text-xs text-rose-400">
                {result.errors.map((e, i) => <li key={i}>• {e}</li>)}
              </ul>
            )}
          </div>
          <Button variant="outline" onClick={fullReset}>Weiteren Abgleich starten</Button>
        </div>
      )}
    </div>
  );
}

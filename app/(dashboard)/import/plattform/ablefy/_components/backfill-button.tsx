"use client";

import { useState } from "react";
import { RefreshCw, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { runAblefyBackfill } from "@/lib/actions/ablefy-backfill";
import type { BackfillResult } from "@/lib/actions/ablefy-backfill";

export function AblefyBackfillButton() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = useState<BackfillResult | null>(null);

  async function handleBackfill() {
    setStatus("loading");
    setResult(null);

    const data = await runAblefyBackfill();
    setResult(data);
    setStatus(data.success ? "success" : "error");
  }

  return (
    <div className="rounded-lg border border-border bg-card px-5 py-4 space-y-3">
      <div>
        <p className="text-sm font-medium">Historische Zahlungen importieren</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Lädt alle bisherigen Ablefy-Zahlungen automatisch — einmalig ausführen.
          Bereits importierte Zahlungen werden automatisch übersprungen.
        </p>
      </div>

      <button
        onClick={handleBackfill}
        disabled={status === "loading" || status === "success"}
        className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {status === "loading" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : status === "success" ? (
          <CheckCircle className="h-4 w-4" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        {status === "loading"
          ? "Wird importiert…"
          : status === "success"
          ? "Fertig!"
          : "Alle alten Zahlungen importieren"}
      </button>

      {result && !result.success && (
        <div className="rounded-md px-3 py-2.5 text-xs space-y-2 bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <div className="flex items-center gap-1.5 font-medium">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            Ablefy API antwortet nicht wie erwartet
          </div>
          <p className="opacity-80">
            Die automatische API-Verbindung ist noch nicht verfügbar. Bitte importiere die historischen Zahlungen manuell per CSV-Export:
          </p>
          <ol className="opacity-80 space-y-0.5 list-decimal list-inside">
            <li>In Ablefy: Statistiken → Transaktionen → Exportieren</li>
            <li>Die heruntergeladene CSV-Datei unten hochladen</li>
          </ol>
        </div>
      )}

      {result && result.success && (
        <div className="rounded-md px-3 py-2.5 text-xs space-y-1 bg-green-500/10 text-green-400 border border-green-500/20">
          <div className="flex items-center gap-1.5 font-medium">
            <CheckCircle className="h-3.5 w-3.5" />
            {result.message}
          </div>
          {result.errors.length > 0 && (
            <ul className="mt-1 space-y-0.5 opacity-80">
              {result.errors.slice(0, 5).map((e, i) => (
                <li key={i}>• {e}</li>
              ))}
              {result.errors.length > 5 && <li>…und {result.errors.length - 5} weitere</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

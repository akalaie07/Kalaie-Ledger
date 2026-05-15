"use client";

import { useState, useTransition } from "react";
import { Trash2, TriangleAlert, X } from "lucide-react";
import { resetOrgData } from "@/lib/actions/super-admin";

export function ResetDataButton({
  orgId,
  orgName,
}: {
  orgId: string;
  orgName: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [result, setResult] = useState<{ deals: number; batches: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const CONFIRM_WORD = "RESET";
  const canConfirm = confirmText === CONFIRM_WORD;

  function handleOpen() {
    setOpen(true);
    setConfirmText("");
    setResult(null);
    setError(null);
  }

  function handleClose() {
    if (pending) return;
    setOpen(false);
    setConfirmText("");
    setResult(null);
    setError(null);
  }

  function handleReset() {
    if (!canConfirm) return;
    startTransition(async () => {
      const res = await resetOrgData(orgId);
      if (res.error) {
        setError(res.error);
      } else {
        setResult(res.deleted ?? { deals: 0, batches: 0 });
        setConfirmText("");
      }
    });
  }

  return (
    <>
      {/* Trigger */}
      <button
        onClick={handleOpen}
        className="flex items-center gap-2 rounded-lg border border-red-900/50 bg-red-900/10 px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-900/20 transition-colors"
      >
        <Trash2 className="h-4 w-4" />
        Alle Daten zurücksetzen
      </button>

      {/* Modal Overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Dialog */}
          <div className="relative z-10 w-full max-w-md rounded-xl border border-red-900/50 bg-card shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-red-900/30 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-red-900/20 p-2">
                  <TriangleAlert className="h-4 w-4 text-red-400" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Alle Daten zurücksetzen</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{orgName}</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                disabled={pending}
                className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-4">
              {result ? (
                /* Erfolg */
                <div className="space-y-3">
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm">
                    <p className="font-medium text-emerald-300">Daten wurden gelöscht</p>
                    <ul className="mt-1.5 space-y-0.5 text-emerald-300/70 text-xs">
                      <li>• {result.deals} {result.deals === 1 ? "Deal" : "Deals"} gelöscht</li>
                      <li>• {result.batches} Import-{result.batches === 1 ? "Batch" : "Batches"} gelöscht</li>
                      <li>• Raten, Einmalzahlungen & Inkasso-Fälle via Cascade gelöscht</li>
                    </ul>
                  </div>
                  <button
                    onClick={handleClose}
                    className="w-full rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted transition-colors"
                  >
                    Schließen
                  </button>
                </div>
              ) : (
                /* Bestätigungs-Formular */
                <>
                  <div className="rounded-lg border border-red-900/40 bg-red-900/10 px-4 py-3 text-xs text-red-400/80 space-y-1">
                    <p className="font-semibold text-red-400">⚠ Diese Aktion ist unwiderruflich</p>
                    <p>Folgende Daten werden permanent gelöscht:</p>
                    <ul className="mt-1 space-y-0.5 list-disc list-inside">
                      <li>Alle Deals</li>
                      <li>Alle Raten & Einmalzahlungen</li>
                      <li>Alle Inkasso-Fälle</li>
                      <li>Alle Import-Batches & -Zeilen</li>
                    </ul>
                    <p className="mt-1.5">Produkte, Plattformen, Closer und User-Daten bleiben erhalten.</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">
                      Tippe <span className="font-mono font-semibold text-foreground">{CONFIRM_WORD}</span> zur Bestätigung
                    </label>
                    <input
                      type="text"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder={CONFIRM_WORD}
                      disabled={pending}
                      className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-50"
                      autoComplete="off"
                    />
                  </div>

                  {error && (
                    <p className="text-xs text-destructive">{error}</p>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={handleClose}
                      disabled={pending}
                      className="flex-1 rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      Abbrechen
                    </button>
                    <button
                      onClick={handleReset}
                      disabled={!canConfirm || pending}
                      className="flex-1 rounded-lg bg-red-900 px-4 py-2 text-sm font-medium text-red-100 hover:bg-red-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {pending ? "Wird gelöscht…" : "Endgültig löschen"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useState, useEffect } from "react";
import { X, Sparkles } from "lucide-react";

const RELEASE_KEY = "kalaie_whats_new_2026-06-16";

export function WhatsNewBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(RELEASE_KEY)) {
      setVisible(true);
    }
  }, []);

  function dismiss() {
    localStorage.setItem(RELEASE_KEY, "seen");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="border-b border-primary/20 bg-primary/5 px-6 py-4">
      <div className="mx-auto max-w-4xl flex items-start gap-4">
        <div className="mt-0.5 rounded-md bg-primary/15 p-1.5 text-primary shrink-0">
          <Sparkles className="h-4 w-4" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold mb-2">Update vom 16. Juni 2026 — Was ist neu?</p>

          <div className="grid gap-x-8 gap-y-0.5 sm:grid-cols-2 text-sm">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Behoben</p>
              <ul className="space-y-0.5 text-muted-foreground">
                <li className="flex gap-2">
                  <span className="text-emerald-400 shrink-0">✓</span>
                  Speichern-Problem bei Deals endgültig behoben
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400 shrink-0">✓</span>
                  Anzahlung wird nur noch angezeigt, wenn auch eine vereinbart wurde
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400 shrink-0">✓</span>
                  Bezahlter Upsell jetzt auch in der Deals-Liste sichtbar
                </li>
              </ul>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Neu</p>
              <ul className="space-y-0.5 text-muted-foreground">
                <li className="flex gap-2">
                  <span className="text-primary shrink-0">+</span>
                  Einzelne Raten direkt bearbeiten (Stift) und löschen (Papierkorb)
                </li>
              </ul>
            </div>
          </div>
        </div>

        <button
          onClick={dismiss}
          aria-label="Schließen"
          className="mt-0.5 shrink-0 rounded p-1 text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

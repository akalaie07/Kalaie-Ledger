"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

// Version, mit der das aktuell geladene Bundle gebaut wurde (zur Build-Zeit eingebacken).
const CURRENT_BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const POLL_INTERVAL_MS = 60_000;

/**
 * Prüft regelmäßig, ob serverseitig eine neue Version deployt wurde, und zeigt
 * dann einen dauerhaften Hinweis mit "Aktualisieren"-Button (lädt die Seite neu).
 * Wird im Dashboard-Layout gemountet.
 */
export function UpdateNotifier() {
  const notified = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (notified.current || document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { buildId } = (await res.json()) as { buildId?: string };
        if (cancelled || !buildId || buildId === "unknown" || buildId === CURRENT_BUILD) return;

        notified.current = true;
        toast("Neue Version verfügbar", {
          id: "update-available",
          description: "Es gibt ein Update. Bitte die Seite aktualisieren.",
          duration: Infinity,
          action: {
            label: "Aktualisieren",
            onClick: () => window.location.reload(),
          },
        });
      } catch {
        // offline / vorübergehender Fehler — ignorieren
      }
    }

    const interval = setInterval(check, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    const initial = setTimeout(check, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(initial);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}

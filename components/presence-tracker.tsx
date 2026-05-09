"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Unsichtbare Komponente — aktualisiert last_seen_at alle 30 Sekunden.
 * Wird im Dashboard-Layout eingebunden, läuft im Hintergrund.
 */
export function PresenceTracker({ userId }: { userId: string }) {
  useEffect(() => {
    const supabase = createClient();

    async function ping() {
      await supabase
        .from("profiles")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", userId);
    }

    ping(); // sofort beim Mount
    const interval = setInterval(ping, 30_000); // alle 30s

    return () => clearInterval(interval);
  }, [userId]);

  return null;
}

import type { CurrentSession } from "@/lib/auth/get-current-org";

/**
 * Alle verfügbaren Feature-Flags mit Beschreibung.
 * Neue Features hier eintragen — sie erscheinen automatisch im Super-Admin Panel.
 */
export const AVAILABLE_FEATURES: { key: string; label: string; description: string }[] = [
  {
    key: "msm_mcc_filter",
    label: "MSM/MCC Produkt-Filter",
    description: "Zeigt Kategorie-Tabs (MSM / MCC) in der Deals-Liste an.",
  },
  {
    key: "zahlungsabgleich_copecart",
    label: "Copecart-Export Import",
    description: "Ermöglicht das Importieren von Copecart-Zahlungs-Exporten.",
  },
  {
    key: "zahlungsabgleich_digistore",
    label: "Digistore-Export Import",
    description: "Ermöglicht das Importieren von Digistore-Zahlungs-Exporten.",
  },
  {
    key: "zahlungsabgleich_ablefy",
    label: "Ablefy-Export Import",
    description: "Ermöglicht das Importieren von Ablefy-Zahlungs-Exporten.",
  },
];

/**
 * Prüft ob eine Organisation ein bestimmtes Feature aktiviert hat.
 */
export function hasFeature(session: CurrentSession, flag: string): boolean {
  return session.features.includes(flag);
}

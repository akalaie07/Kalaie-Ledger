---
name: project_smart_import_direction
description: Produktrichtung — der Nutzer will den Import zum "smarten" Single-Source-of-Truth ausbauen (provisioniert auch Stammdaten), ganzes Programm umstrukturieren (2026-06-09)
metadata:
  type: project
---

Der Nutzer ist Betreiber einer **mandantenfähigen SaaS** ("Kalaie Ledger" / Buchhaltung-Projekt) für Vertriebsteams. Die Org mit 225 Deals (6 Closer, 6 Produkte) gehört **einem seiner Kunden** (Tenant), nicht ihm selbst.

**Richtungsentscheidung (2026-06-09):** Das ganze Programm soll umstrukturiert werden, **Priorität #1 = der Import**. Der Import soll von Anfang an „wirklich alles berücksichtigen" — nicht nur Leads/Deals, sondern auch **Stammdaten** (Produkte, Plattformen, Closer …). Heißt: beim Hochladen eines Plattform-Exports soll der Import fehlende Produkte/Closer automatisch anlegen bzw. zuordnen, statt sie als „nicht zuordenbar" liegen zu lassen.

**Warum:** Beim Vorfall gingen Closer/Produkt-Zuordnungen verloren; außerdem matchen CSV-Produktnamen (z.B. „Die Maestro Sales Masterclass - Gold") nicht mit Stammdaten-Namen (z.B. „MSM Gold") → vieles bleibt unzugeordnet. Der Import muss das selbst lösen.

**Kernbausteine des geplanten „Smart Import":** Auto-Provisionierung von Stammdaten; Alias-/Mapping-Gedächtnis (raw name → master id, einmal zuordnen, künftig automatisch); Preview (X neu / Y angereichert / N neue Produkte); Batch-Tracking + Undo (Infra `import_batches`/`import_rows` existiert); nicht-destruktiv (fill-only-Fix ist drin, siehe [[project_csv_overwrite_bug]]); die zwei parallelen Import-Pfade (`importDeals` alt vs `executeImport` neu) zusammenführen.

**Recovery-Status:** `recovery_products.sql` (Downloads) füllt 246 Deals mit MSM Gold/Silber/Bronze (entkoppelt, jederzeit ausführbar). Mehrdeutige Produkte (MCC, Community, Live Calls) werden durch den neuen Smart Import gelöst. Closer aus CSVs nicht wiederherstellbar.

**Entscheidung 2026-06-09:** Unbekannte Produkte/Closer werden in der Vorschau BESTÄTIGT (nicht blind angelegt).

**Phase 1 FERTIG (typecheckt + eslint sauber):**
- Backend: Migration `0015_import_aliases.sql` (Tabelle import_aliases + RLS); Typ in `lib/types/database.ts`; `lib/import/resolve.ts` (resolveEntity/resolveEntities/buildResolveMap, nutzt normName+jaroWinkler aus fuzzy.ts, jetzt exportiert); `lib/actions/import-aliases.ts` (getAliases/saveAliases/resolveImport/createProductForImport); `import-execute.ts` nutzt alias-fähiges resolveProductId beim Deal-Anlegen.
- Frontend: `app/(dashboard)/import/_components/product-mapping-step.tsx` (Bestätigungs-UI mit Vorschlag-Dropdown + "Neu anlegen"); in `platform-import-wizard.tsx` integriert (resolveImport beim Vorschau-Laden, saveAliases beim Import).

WICHTIG (Korrektur 2026-06-09): Die Seiten `/import/plattform/{digistore,copecart}` rendern `CsvImportWizard` (csv-import-wizard.tsx, → importDeals), NICHT platform-import-wizard.tsx (die ist scheinbar ungenutzt/dead). Mapping-Step daher ZUSÄTZLICH in csv-import-wizard.tsx eingebaut (im "Prüfen"-Schritt) + `importDeals` in lib/actions/import.ts alias-fähig gemacht (productResolveMap). Die ProductMappingStep-Komponente wird jetzt von beiden Wizards genutzt.

ERLEDIGT: Produkt-Zuordnung in ALLEN 3 Plattform-Wizards — Digistore/Copecart via CsvImportWizard, Ablefy via AblefyImportWizard (ablefy-import-wizard.tsx). Digistore lokal getestet (User: "hat geklappt"). Zahlungsabgleich braucht den UI-Step NICHT (nutzt executeImport = schon alias-fähig). Migration 0015 auf Prod eingespielt.

DEPLOY-STAND: Commits `04e392b` (Smart Import) + `97a6c28` (Build-Fix) auf main. Vercel-Projekt heißt "buchhaltung-kalaie", baut von main, Vercel-Account "Amir's projects" (Hobby).
LEKTION: 04e392b allein ließ Vercel-Build fehlschlagen — ich hatte nur MEINE Dateien committet, aber die WIP-customerEmail-Arbeit war über mehrere Dateien verteilt: committete fuzzy.ts/process-webhook-event.ts NUTZEN deal.customerEmail, aber die Typ-Definition (preview.ts) + import-preview.ts waren uncommittete WIP → inkonsistent. Lokaler Build lief, weil dort die ganze WIP im Tree war; Vercel baut nur den Commit. Fix-Commit 97a6c28 holt preview.ts + import-preview.ts nach (nur 4 Zeilen). Isoliert verifiziert: baut sauber (Exit 0). zahlungsabgleich.ts + platform-configs.ts berühren customerEmail NICHT → bleiben unkommittet (User-WIP). User muss `git push` (97a6c28 ist noch lokal, 04e392b schon auf origin/main).
MERKE: Beim Teil-Committen in fremdem dirty Tree IMMER den Commit-Stand isoliert bauen (git stash + build), nicht nur den Working Tree.

NOCH OFFEN: Closer aus Parsern extrahieren (Phase 1.5); recovery_products.sql noch nicht ausgeführt (Produkt-Rettung Gold/Silber/Bronze).

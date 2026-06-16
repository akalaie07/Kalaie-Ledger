---
name: project_csv_overwrite_bug
description: CSV-Re-Import überschrieb bestehende Deals destruktiv — Ursache, Fix und Datenrettungs-Lage (2026-06-09)
metadata:
  type: project
---

CSV-Import-Bug im Buchhaltung-Projekt (Ordner `Buchhaltung`, nicht `Buchhaltung_Kalaie`). Am 2026-06-09 gemeldet: Nutzer lud aktuelle CSV hoch, „alle gespeicherten Daten überschrieben".

**Ursache:** `lib/actions/import.ts` → `importDeals()` UPDATE-Zweig (Match per eindeutiger `order_id`) überschrieb bestehende Deals blind: `closer_id` wurde IMMER auf null gesetzt (CSV-Wizard schickt nie `closer_name`), `product_id`/`total_price`/`payment_type`/`close_date` ebenso. `payment_type`-Wechsel verwaiste Raten/Einmalzahlungen.

**Fix (finale Semantik, vom Nutzer bestätigt):** Abgleich bestehender Deals bleibt über `order_id`. UPDATE ist jetzt „fill-only-if-empty" — es werden NUR Felder gesetzt, die im bestehenden Deal leer/null sind (platform_id/product_id/closer_id null, total_price=0, customer_name = Platzhalter, notes/payment_method leer). Vorhandene Werte bleiben unangetastet. `close_date` wird nie geändert (Pflichtfeld). `payment_type` bei bestehenden Deals nicht geändert (nur Warnung, sonst verwaisen Raten). Neue Zeilen (order_id nicht gefunden) → INSERT. Achtung: CSV ohne order_id → jede Zeile INSERT → Duplikate beim Re-Upload. Außerdem vorbestehenden Build-Breaker in `lib/webhooks/process-webhook-event.ts` behoben (`customerEmail` fehlte in `buildDealContext`). `npx tsc --noEmit` = exit 0.

**Dual-Import-Pfade (Tech-Debt):** Alter Pfad `importDeals` nutzen `csv-import-wizard`, `ablefy-import-wizard`, `migration-wizard`. Neuer sicherer Pfad `previewImport`+`executeImport` (Konflikt-Erkennung, `import_batches`/`import_rows`, Rollback) nutzen `import-wizard`, `platform-import-wizard`, `zahlungsabgleich-wizard`. Empfehlung: CSV-Upload auf den neuen Pfad migrieren.

**Datenrettung / Supabase-Zugang:** Prod-Projekt ist `dfizzehiqhrlzmwsvkxq` (aus `.env.local`). Die im Tooling verbundene Supabase-Integration hat NUR Zugriff auf ein anderes Projekt (`zrfyoevhppadybojowtw`, „Scanner") → `list_tables`/SQL auf dem Prod-Projekt = „You do not have permission". Direkte DB-Inspektion/Restore via MCP daher NICHT möglich. Recovery nur über Supabase-Dashboard (PITR/Daily-Backups) oder Integration aufs richtige Projekt umhängen. Daten wurden überschrieben, nicht gelöscht → Zeilen existieren noch; `deals.updated_at` (Trigger seit Migration 0012) identifiziert betroffene Zeilen.

Siehe [[project_import_refactor]] und [[project_phase1_fixes]].

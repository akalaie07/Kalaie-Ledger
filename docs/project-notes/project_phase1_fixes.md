---
name: Phase 1 Security & Finanzlogik-Fixes
description: Welche kritischen Risiken in Phase 1 behoben wurden und welche Dateien geändert wurden
type: project
---

Phase 1 des Refactors wurde am 2026-05-11 umgesetzt. TypeScript-Check: fehlerfrei (Exit Code 0).

**Geänderte Dateien:**
- `lib/actions/import-execute.ts` — requireRole("admin"), estimatedTotal=0 für Raten, Digistore All-Mark-Fix
- `lib/actions/import-preview.ts` — requireRole("admin")
- `lib/actions/zahlungsabgleich.ts` — requireRole("admin")
- `lib/import/adapters/ablefy.ts` — Rückbuchung → chargeback statt refund
- `app/(dashboard)/berichte/page.tsx` — Provisionen in Soll + Ist aufgeteilt

**Was bewusst NICHT umgesetzt wurde:**
- Keine import_batches-Tabelle
- Keine payment_events-Tabelle
- Keine customers-Tabelle
- Keine Pagination
- Keine DB-Migration für Constraints
- Kein Super-Admin-Log
- Kein hasFeature("import")-Gate

**Why:** Nur kritische Security- und Finanzlogik-Risiken ohne große Architekturänderungen entschärfen.

**How to apply:** Phase 2 wurde am 2026-05-11 umgesetzt: import_batches + import_rows Tabellen, import_batch_id auf deals/installments, executeImport schreibt Batch-Tracking. Noch offen: Rollback-System, Cashflow-Berichte.

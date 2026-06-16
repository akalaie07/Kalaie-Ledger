---
name: Import-Refactor — Normalized Model
description: Kalaie Ledger Import wurde auf ein einheitliches Normalized-Import-Modell refactored (Mai 2026)
type: project
---

Neues Import-Modell in lib/import/ gebaut (Buchhaltung-Projekt, nicht Buchhaltung_Kalaie).

**Was gebaut wurde:**
- `lib/import/types.ts` — NormalizedImportRow, PreviewItem, alle Enums
- `lib/import/adapters/shared.ts` — gemeinsame Parser-Utils
- `lib/import/adapters/copecart.ts` — parseCopecartExport()
- `lib/import/adapters/ablefy.ts` — parseAblefyExport()
- `lib/import/adapters/digistore.ts` — parseDigistoreExport()
- `lib/import/adapters/legacy-xlsx.ts` — parseLegacyXlsxImport()
- `lib/import/preview.ts` — classifyRows() pure Funktion, kein DB-Zugriff
- `lib/import/index.ts` — Re-exports
- `lib/actions/import-preview.ts` — Server Action previewImport()
- `app/(dashboard)/import/_components/import-wizard.tsx` — 3-Schritt-Flow (Upload → Preview → Bestätigen)

**Why:** Platform-Exporte sollen nicht direkt in die DB schreiben, sondern zuerst normalisiert und als Preview mit Confidence/Klassifikation angezeigt werden.

**How to apply:** Nächster Schritt ist ein eigener DB-Write-Action (lib/actions/import-execute.ts) der NormalizedImportRow[] direkt verarbeitet, ohne den alten AbgleichRow-Konverter zu brauchen.

Das Projekt liegt unter Buchhaltung (nicht Buchhaltung_Kalaie — der zweite Ordner ist leer bis auf .claude-Settings).

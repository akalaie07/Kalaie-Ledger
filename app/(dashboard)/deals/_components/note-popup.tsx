"use client";

import { useRef, useState, useTransition, useEffect } from "react";
import { NotebookPen, X, Check } from "lucide-react";
import { updateDealNote } from "@/lib/actions/deals";

export function NotePopup({
  dealId,
  notes,
}: {
  dealId: string;
  notes: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(notes ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const popupRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Außerhalb klicken → schließen
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Autofocus textarea beim Öffnen
  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 50);
  }, [open]);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await updateDealNote(dealId, value);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        setOpen(false);
      }, 1000);
    });
  }

  const hasNote = !!notes;

  return (
    <div className="relative" ref={popupRef}>
      {/* Icon — immer sichtbar */}
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); setOpen((o) => !o); }}
        title={hasNote ? notes! : "Notiz hinzufügen"}
        className={`transition-colors rounded p-0.5 ${
          hasNote
            ? "text-amber-400 hover:text-amber-300"
            : "text-muted-foreground/40 hover:text-muted-foreground"
        }`}
      >
        <NotebookPen className="h-3.5 w-3.5" />
      </button>

      {/* Popup */}
      {open && (
        <div className="absolute left-0 top-6 z-50 w-72 rounded-lg border border-border bg-card shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">Notiz</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Textarea */}
          <div className="p-3">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={4}
              placeholder="Notiz eingeben…"
              className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {error && (
            <p className="px-3 pb-2 text-xs text-destructive">{error}</p>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saved ? (
                <><Check className="h-3 w-3" /> Gespeichert</>
              ) : pending ? (
                "Speichern…"
              ) : (
                "Speichern"
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

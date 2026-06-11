"use client";

import { useState, useTransition } from "react";
import { NotebookPen, Check } from "lucide-react";
import { updateDealNote } from "@/lib/actions/deals";

export function MahnungNoteEditor({
  dealId,
  notes,
}: {
  dealId: string;
  notes: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(notes ?? "");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updateDealNote(dealId, value);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setSaved(true);
      setTimeout(() => { setSaved(false); setOpen(false); }, 1200);
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title={notes ? "Notiz bearbeiten" : "Notiz hinzufügen"}
        className="flex items-center gap-1.5 rounded px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors max-w-[180px]"
      >
        <NotebookPen className="h-3.5 w-3.5 shrink-0" />
        {notes
          ? <span className="truncate">{notes}</span>
          : <span className="italic">Notiz…</span>}
      </button>
    );
  }

  return (
    <div className="flex items-start gap-1.5">
      {error && (
        <p className="text-xs text-destructive max-w-[180px]">{error}</p>
      )}
      <textarea
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={2}
        placeholder="Notiz eingeben…"
        className="w-48 rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring resize-none"
      />
      <div className="flex flex-col gap-1 pt-0.5">
        <button
          onClick={save}
          disabled={pending}
          className="rounded p-1 text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
          title="Speichern"
        >
          {saved
            ? <Check className="h-3.5 w-3.5" />
            : pending
            ? <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent" />
            : <Check className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-xs leading-none"
          title="Abbrechen"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

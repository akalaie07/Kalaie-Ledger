export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8 space-y-6">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-6 w-48 rounded bg-muted animate-pulse" />
        <div className="h-4 w-64 rounded bg-muted/60 animate-pulse" />
      </div>

      {/* Table skeleton */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="border-b border-border bg-muted/40 px-4 py-2.5 flex gap-8">
          {["Datum", "Quelle", "Datei", "Ergebnis", "Status"].map((h) => (
            <div key={h} className="h-3.5 w-16 rounded bg-muted animate-pulse" />
          ))}
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="border-b border-border px-4 py-3 flex gap-8 animate-pulse">
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="h-4 w-16 rounded bg-muted/70" />
            <div className="h-4 w-32 rounded bg-muted/60" />
            <div className="h-4 w-20 rounded bg-muted/50" />
            <div className="h-5 w-24 rounded-full bg-muted/40" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function EinstellungenLoading() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-8 animate-pulse">
      <div className="space-y-2">
        <div className="h-6 w-36 rounded-md bg-muted" />
        <div className="h-4 w-56 rounded-md bg-muted/60" />
      </div>

      {/* Table block */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="border-b border-border bg-muted/40 px-4 py-3">
          <div className="h-4 w-24 rounded bg-muted" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-6 px-4 py-3">
              <div className="h-4 w-40 rounded bg-muted" />
              <div className="h-4 w-20 rounded bg-muted/60" />
              <div className="h-5 w-16 rounded-full bg-muted/60 ml-auto" />
              <div className="h-4 w-16 rounded bg-muted/60" />
            </div>
          ))}
        </div>
      </div>

      {/* Second block */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="border-b border-border bg-muted/40 px-4 py-3">
          <div className="h-4 w-28 rounded bg-muted" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-6 px-4 py-3">
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="h-4 w-16 rounded bg-muted/60 ml-auto" />
              <div className="h-4 w-16 rounded bg-muted/60" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

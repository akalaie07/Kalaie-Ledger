export default function DealsLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6 animate-pulse">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-6 w-20 rounded-md bg-muted" />
          <div className="h-4 w-32 rounded-md bg-muted/60" />
        </div>
        <div className="h-8 w-28 rounded-md bg-muted" />
      </div>

      {/* Filter bar */}
      <div className="flex gap-2">
        <div className="h-8 w-48 rounded-md bg-muted" />
        <div className="h-8 w-32 rounded-md bg-muted/60" />
        <div className="h-8 w-32 rounded-md bg-muted/60" />
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="border-b border-border bg-muted/40 px-4 py-2.5 flex gap-8">
          {["w-36", "w-24", "w-20", "w-20", "w-16", "w-16"].map((w, i) => (
            <div key={i} className={`h-3.5 ${w} rounded bg-muted`} />
          ))}
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-8 px-4 py-3">
              <div className="h-4 w-36 rounded bg-muted" />
              <div className="h-4 w-24 rounded bg-muted/60" />
              <div className="h-4 w-20 rounded bg-muted/60" />
              <div className="h-4 w-20 rounded bg-muted/60" />
              <div className="h-5 w-16 rounded-full bg-muted/60" />
              <div className="h-4 w-16 rounded bg-muted/60 ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

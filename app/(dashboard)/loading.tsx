export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-8 animate-pulse">
      {/* Page header */}
      <div className="space-y-2">
        <div className="h-6 w-40 rounded-md bg-muted" />
        <div className="h-4 w-64 rounded-md bg-muted/60" />
      </div>

      {/* Primary content block */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="border-b border-border bg-muted/40 px-4 py-3">
          <div className="h-4 w-28 rounded bg-muted" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <div className="h-4 w-40 rounded bg-muted" />
              <div className="h-4 w-24 rounded bg-muted/60 ml-auto" />
              <div className="h-4 w-20 rounded bg-muted/60" />
              <div className="h-4 w-16 rounded bg-muted/60" />
            </div>
          ))}
        </div>
      </div>

      {/* Secondary block */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="border-b border-border bg-muted/40 px-4 py-3">
          <div className="h-4 w-36 rounded bg-muted" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="h-4 w-20 rounded bg-muted/60 ml-auto" />
              <div className="h-4 w-16 rounded bg-muted/60" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

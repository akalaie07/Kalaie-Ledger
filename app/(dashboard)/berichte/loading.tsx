export default function BerichteLoading() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-8 animate-pulse">
      <div className="space-y-2">
        <div className="h-6 w-24 rounded-md bg-muted" />
        <div className="h-4 w-48 rounded-md bg-muted/60" />
      </div>

      {/* Bar chart skeleton */}
      <div className="space-y-3">
        <div className="h-4 w-32 rounded bg-muted" />
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-end gap-2" style={{ height: "120px" }}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1">
                <div
                  className="w-full rounded-sm bg-muted"
                  style={{ height: `${20 + Math.random() * 60}px` }}
                />
                <div className="h-2 w-6 rounded bg-muted/60" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Two commission tables */}
      {[5, 3].map((rows, t) => (
        <div key={t} className="space-y-3">
          <div className="h-4 w-44 rounded bg-muted" />
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="border-b border-border bg-muted/40 px-4 py-2.5 flex gap-8">
              {["w-32", "w-24", "w-20", "w-24"].map((w, i) => (
                <div key={i} className={`h-3.5 ${w} rounded bg-muted`} />
              ))}
            </div>
            <div className="divide-y divide-border">
              {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="flex items-center gap-8 px-4 py-3">
                  <div className="h-4 w-32 rounded bg-muted" />
                  <div className="h-4 w-24 rounded bg-muted/60" />
                  <div className="h-4 w-16 rounded bg-muted/60" />
                  <div className="h-4 w-24 rounded bg-muted/60" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

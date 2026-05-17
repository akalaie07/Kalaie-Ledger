export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8 space-y-6">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-6 w-48 rounded bg-muted animate-pulse" />
        <div className="h-4 w-64 rounded bg-muted/60 animate-pulse" />
      </div>

      {/* Card skeletons */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-lg border border-border p-5 space-y-4 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="h-4 w-40 rounded bg-muted" />
            <div className="h-6 w-20 rounded-full bg-muted" />
          </div>
          <div className="h-4 w-full rounded bg-muted/60" />
          <div className="h-4 w-3/4 rounded bg-muted/40" />
          <div className="flex gap-2">
            <div className="h-8 w-28 rounded bg-muted" />
            <div className="h-8 w-28 rounded bg-muted/60" />
          </div>
        </div>
      ))}
    </div>
  );
}

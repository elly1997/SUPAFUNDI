export function DashboardPageSkeleton() {
  return (
    <div className="app-page animate-pulse space-y-6">
      <div className="h-10 w-48 rounded-lg bg-muted" />
      <div className="h-4 w-72 max-w-full rounded bg-muted/70" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass-card h-28 rounded-xl bg-card/60" />
        ))}
      </div>
      <div className="glass-card h-64 rounded-xl bg-card/60" />
    </div>
  );
}

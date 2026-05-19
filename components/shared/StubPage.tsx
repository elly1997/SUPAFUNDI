type StubPageProps = {
  title: string;
  description?: string;
};

export function StubPage({ title, description }: StubPageProps) {
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">
        {description ?? "Route scaffold — content arrives in later Phase 1 steps."}
      </p>
    </div>
  );
}

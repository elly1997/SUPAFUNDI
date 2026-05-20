/** Minimal outlet shape for default/active resolution (client + server). */
export type OutletLike = {
  id: string;
  name: string;
  code?: string | null;
  is_default?: boolean | null;
};

/** Organization default branch: flagged default → code MAIN → name contains "main" → first in list. */
export function resolveDefaultOutletId(outlets: OutletLike[]): string | null {
  if (!outlets.length) return null;

  const flagged = outlets.find((o) => o.is_default === true);
  if (flagged) return flagged.id;

  const mainCode = outlets.find(
    (o) => (o.code ?? "").trim().toUpperCase() === "MAIN"
  );
  if (mainCode) return mainCode.id;

  const mainName = outlets.find((o) =>
    /\bmain\b/i.test(o.name.trim())
  );
  if (mainName) return mainName.id;

  return outlets[0]?.id ?? null;
}

/** Active outlet: saved preference → profile assignment → org default. */
export function resolveActiveOutletId(
  outlets: OutletLike[],
  prefs: {
    stored?: string | null;
    profileOutletId?: string | null;
  }
): string | null {
  if (!outlets.length) return null;

  const valid = (id: string | null | undefined) =>
    id && outlets.some((o) => o.id === id) ? id : null;

  return (
    valid(prefs.stored) ??
    valid(prefs.profileOutletId) ??
    resolveDefaultOutletId(outlets)
  );
}

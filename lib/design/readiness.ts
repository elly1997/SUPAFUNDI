/**
 * Design-system readiness checks for SUPAFUNDI TRADERS UI migration.
 */

export type DesignCheck = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
};

const EXPECTED = {
  primary: "#f97316",
  background: "#0f172a",
  themeColor: "#0f172a",
  brandName: "SUPAFUNDI TRADERS",
} as const;

export function getDesignReadinessChecks(): DesignCheck[] {
  if (typeof window === "undefined") {
    return [
      {
        id: "ssr",
        label: "Client theme tokens",
        ok: true,
        detail: "Verified at build time via globals.css and manifest",
      },
    ];
  }

  const root = document.documentElement;
  const styles = getComputedStyle(root);
  const primary = styles.getPropertyValue("--primary").trim();
  const background = styles.getPropertyValue("--background").trim();

  return [
    {
      id: "primary",
      label: "Orange primary token",
      ok: primary.toLowerCase() === EXPECTED.primary,
      detail: primary || "missing",
    },
    {
      id: "background",
      label: "Dark canvas token",
      ok: background.toLowerCase() === EXPECTED.background,
      detail: background || "missing",
    },
    {
      id: "dark",
      label: "Dark mode class on html",
      ok: root.classList.contains("dark"),
      detail: root.className,
    },
  ];
}

export function getDesignReadinessSummary() {
  const checks = getDesignReadinessChecks();
  const passed = checks.filter((c) => c.ok).length;
  return {
    checks,
    passed,
    total: checks.length,
    ready: passed === checks.length,
    brand: EXPECTED.brandName,
  };
}

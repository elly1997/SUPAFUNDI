export type ThemeMode = "dark" | "light" | "system";

export const THEME_STORAGE_KEY = "supafundi-theme";

export function isThemeMode(value: string | null): value is ThemeMode {
  return value === "dark" || value === "light" || value === "system";
}

export function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(raw) ? raw : "dark";
  } catch {
    return "dark";
  }
}

export function resolveTheme(mode: ThemeMode): "dark" | "light" {
  if (mode !== "system") return mode;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

/** Apply theme classes on <html> and persist the choice on this device. */
export function applyTheme(mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(mode);
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* private mode — theme still applies for this session */
  }
}

/** Runs before first paint to avoid a dark→light flash. */
export const THEME_INIT_SCRIPT = `(function(){try{var k="${THEME_STORAGE_KEY}";var m=localStorage.getItem(k);if(m!=="light"&&m!=="dark"&&m!=="system")m="dark";var r=m==="system"?(window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):m;var e=document.documentElement;e.classList.remove("dark","light");e.classList.add(r);e.style.colorScheme=r;}catch(_){}})();`;

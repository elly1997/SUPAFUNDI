const isDev =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_DEBUG_LOGS === "1";

/**
 * Structured, low-noise logging. Avoids console noise in production unless explicitly enabled.
 */
export const logger = {
  warn(message: string, meta?: Record<string, unknown>): void {
    if (!isDev) return;
    if (meta) {
      console.warn(`[HardwarePOS] ${message}`, meta);
    } else {
      console.warn(`[HardwarePOS] ${message}`);
    }
  },
  /** Infrequent service-path messages (e.g. middleware); keep volume low. */
  service(message: string, meta?: Record<string, unknown>): void {
    if (meta) {
      console.warn(`[HardwarePOS][service] ${message}`, meta);
    } else {
      console.warn(`[HardwarePOS][service] ${message}`);
    }
  },
  error(message: string, meta?: Record<string, unknown>): void {
    if (meta) {
      console.error(`[HardwarePOS] ${message}`, meta);
    } else {
      console.error(`[HardwarePOS] ${message}`);
    }
  },
};

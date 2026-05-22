/**
 * Legacy client cap for simple product lists (e.g. settings picker).
 * POS uses `/api/pos/products` with full server-side pagination.
 */
export const PRODUCT_CATALOG_PAGE_SIZE = 500;

/** Supabase PostgREST returns at most 1000 rows per request unless paginated with `.range()`. */
export const SUPABASE_PAGE_SIZE = 1000;

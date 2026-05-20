/**
 * Client-side fetch caps to avoid loading unbounded rows into memory (POS terminal).
 * Price list / stock use server pagination — no practical item cap after chunked queries.
 */
export const PRODUCT_CATALOG_PAGE_SIZE = 500;

/** Supabase PostgREST returns at most 1000 rows per request unless paginated with `.range()`. */
export const SUPABASE_PAGE_SIZE = 1000;

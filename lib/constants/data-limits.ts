/**
 * Client-side fetch caps to avoid loading unbounded rows into memory (POS / catalogue).
 * Server routes and reports should use cursor pagination + aggregates instead.
 */
export const PRODUCT_CATALOG_PAGE_SIZE = 500;

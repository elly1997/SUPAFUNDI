import { customAlphabet } from "nanoid";

const skuBody = customAlphabet("0123456789ABCDEFGHJKLMNPQRSTUVWXYZ", 10);

/**
 * Human-readable internal SKU; uniqueness enforced by DB + retry on conflict.
 */
export function generateProductCode(): string {
  return `AUTO-${skuBody()}`;
}

import {
  HARDWARE_PRODUCT_CATEGORIES,
  canonicalCategoryName,
  normalizeCategoryKey,
} from "@/lib/constants/hardware-product-categories";

export type CategorySuggestion = {
  /** Canonical or existing category name to assign. */
  suggestedName: string;
  /** Keyword that triggered the match. */
  matchedKeyword: string;
  confidence: "high" | "medium";
};

/**
 * Suggest a hardware category from a product name.
 * Prefers longer keyword hits; returns null when nothing confident matches.
 */
export function suggestProductCategory(
  productName: string
): CategorySuggestion | null {
  const hay = ` ${normalizeCategoryKey(productName)} `;
  if (!hay.trim()) return null;

  let best: {
    name: string;
    keyword: string;
    score: number;
  } | null = null;

  for (const def of HARDWARE_PRODUCT_CATEGORIES) {
    for (const rawKw of def.keywords) {
      const kw = normalizeCategoryKey(rawKw);
      if (kw.length < 3) continue;
      if (!hay.includes(kw)) continue;
      // Longer / more specific keywords win
      const score = kw.length + (kw.includes(" ") ? 4 : 0);
      if (!best || score > best.score) {
        best = { name: def.name, keyword: rawKw.trim(), score };
      }
    }
  }

  if (!best) return null;

  return {
    suggestedName: best.name,
    matchedKeyword: best.keyword,
    confidence: best.score >= 8 ? "high" : "medium",
  };
}

/**
 * Resolve which existing category id to use for a suggested canonical name.
 * Prefers exact / alias match on org categories; otherwise caller may create.
 */
export function matchSuggestedToExistingCategories(
  suggestedName: string,
  categories: { id: string; name: string }[]
): { categoryId: string; categoryName: string } | null {
  const target =
    canonicalCategoryName(suggestedName) ?? suggestedName.trim();
  const targetKey = normalizeCategoryKey(target);

  for (const c of categories) {
    const canon = canonicalCategoryName(c.name);
    if (canon && normalizeCategoryKey(canon) === targetKey) {
      return { categoryId: c.id, categoryName: c.name };
    }
    if (normalizeCategoryKey(c.name) === targetKey) {
      return { categoryId: c.id, categoryName: c.name };
    }
  }
  return null;
}

export type CleanupSuggestionRow = {
  productId: string;
  productName: string;
  code: string | null;
  currentCategoryId: string | null;
  currentCategoryName: string;
  suggestedName: string;
  matchedKeyword: string;
  confidence: "high" | "medium";
  /** True when product has no category or is under General/Uncategorized. */
  uncategorized: boolean;
  /** True when current category differs from suggestion. */
  mismatch: boolean;
};

export function buildCleanupSuggestions(input: {
  products: {
    id: string;
    name: string;
    code: string | null;
    category_id: string | null;
  }[];
  categoryNameById: Map<string, string>;
}): CleanupSuggestionRow[] {
  const rows: CleanupSuggestionRow[] = [];

  for (const p of input.products) {
    const suggestion = suggestProductCategory(p.name);
    if (!suggestion) continue;

    const currentName = p.category_id
      ? input.categoryNameById.get(p.category_id)?.trim() || "Unknown"
      : "Uncategorized";
    const currentCanon =
      canonicalCategoryName(currentName) ??
      (normalizeCategoryKey(currentName) === "general" ||
      normalizeCategoryKey(currentName) === "uncategorized" ||
      normalizeCategoryKey(currentName) === "misc"
        ? null
        : currentName);
    const suggestedCanon =
      canonicalCategoryName(suggestion.suggestedName) ??
      suggestion.suggestedName;

    const uncategorized =
      !p.category_id ||
      currentCanon == null ||
      normalizeCategoryKey(currentName) === "general" ||
      normalizeCategoryKey(currentName) === "uncategorized" ||
      normalizeCategoryKey(currentName) === "misc";

    const mismatch =
      !uncategorized &&
      normalizeCategoryKey(currentCanon ?? currentName) !==
        normalizeCategoryKey(suggestedCanon);

    if (!uncategorized && !mismatch) continue;

    rows.push({
      productId: p.id,
      productName: p.name,
      code: p.code,
      currentCategoryId: p.category_id,
      currentCategoryName: currentName,
      suggestedName: suggestedCanon,
      matchedKeyword: suggestion.matchedKeyword,
      confidence: suggestion.confidence,
      uncategorized,
      mismatch,
    });
  }

  rows.sort((a, b) => {
    if (a.uncategorized !== b.uncategorized) return a.uncategorized ? -1 : 1;
    if (a.confidence !== b.confidence)
      return a.confidence === "high" ? -1 : 1;
    return a.productName.localeCompare(b.productName);
  });

  return rows;
}

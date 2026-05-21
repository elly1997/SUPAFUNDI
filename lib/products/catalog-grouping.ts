/** Label for products with no category_id (matches inventory reports). */
export const UNCATEGORIZED_CATEGORY = "General";

export function resolveCategoryName(
  categoryId: string | null | undefined,
  nameById: Map<string, string>
): string {
  if (!categoryId) return UNCATEGORIZED_CATEGORY;
  return nameById.get(categoryId) ?? UNCATEGORIZED_CATEGORY;
}

export function compareByCategoryThenName<
  T extends { categoryName: string; name: string },
>(a: T, b: T): number {
  const byCat = a.categoryName.localeCompare(b.categoryName, undefined, {
    sensitivity: "base",
  });
  if (byCat !== 0) return byCat;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

export type CatalogCategorySection<T extends { categoryName: string }> = {
  categoryName: string;
  rows: T[];
};

/** Sort by category → name, then group into consecutive sections. */
export function groupCatalogByCategory<T extends { categoryName: string; name: string }>(
  rows: T[]
): CatalogCategorySection<T>[] {
  const sorted = [...rows].sort(compareByCategoryThenName);
  const sections: CatalogCategorySection<T>[] = [];
  for (const row of sorted) {
    const last = sections[sections.length - 1];
    if (last?.categoryName === row.categoryName) {
      last.rows.push(row);
    } else {
      sections.push({ categoryName: row.categoryName, rows: [row] });
    }
  }
  return sections;
}

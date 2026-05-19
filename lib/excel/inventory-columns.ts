/** Template columns — matches “General Stock list” spreadsheet layout. */
export const INVENTORY_TEMPLATE_HEADERS = [
  "Page",
  "Code",
  "Name",
  "Category",
  "Quantity",
  "Cost",
  "Retail Price",
  "Unit",
  "Notes",
] as const;

export type InventoryTemplateHeader = (typeof INVENTORY_TEMPLATE_HEADERS)[number];

/** Example row — blank Code auto-generates on import; prices may be filled later. */
export const INVENTORY_TEMPLATE_SAMPLE_ROW: (string | number)[] = [
  1,
  "",
  "Example Nail 2 inch",
  "General",
  100,
  "",
  "",
  "pcs",
  "",
];

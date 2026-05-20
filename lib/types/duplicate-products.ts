export type DuplicateProductEntry = {
  id: string;
  code: string | null;
  name: string;
  createdAt: string;
  totalStockQty: number;
  keepRecommended: boolean;
};

export type DuplicateProductGroup = {
  nameKey: string;
  displayName: string;
  entries: DuplicateProductEntry[];
  toRemoveCount: number;
};

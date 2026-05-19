"use client";

import { useQuery } from "@tanstack/react-query";
import { listCategoriesForPos } from "@/lib/actions/pos";
import { cn } from "@/lib/utils";

type Props = {
  value: string | null;
  onChange: (categoryId: string | null) => void;
};

export function PosCategoryChips({ value, onChange }: Props) {
  const { data: categories = [] } = useQuery({
    queryKey: ["pos-categories"],
    queryFn: listCategoriesForPos,
    staleTime: 60_000,
  });

  if (categories.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={cn(
          "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold touch-manipulation transition-colors",
          value === null
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground hover:text-foreground"
        )}
      >
        All
      </button>
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onChange(c.id)}
          className={cn(
            "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold touch-manipulation transition-colors",
            value === c.id
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}

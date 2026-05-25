"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  categories: Array<string | { id: string; name: string }>;
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

export function CatalogCategoryFilter({
  categories,
  value,
  onChange,
  className,
}: Props) {
  if (categories.length <= 1) return null;

  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? "all")}>
      <SelectTrigger className={className ?? "w-full sm:w-48"}>
        <SelectValue placeholder="All categories" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All categories</SelectItem>
        {categories.map((category) => {
          const value =
            typeof category === "string" ? category : category.id;
          const label =
            typeof category === "string" ? category : category.name;
          return (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

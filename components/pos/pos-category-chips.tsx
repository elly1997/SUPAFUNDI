"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { listCategoriesForPos } from "@/lib/actions/pos";
import { cn } from "@/lib/utils";

type Props = {
  value: string | null;
  onChange: (categoryId: string | null) => void;
};

export function PosCategoryChips({ value, onChange }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ["pos-categories"],
    queryFn: () => listCategoriesForPos(),
    staleTime: 60_000,
  });

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [categories.length]);

  if (categories.length === 0) return null;

  return (
    <div
      ref={scrollerRef}
      role="listbox"
      aria-label="Product categories"
      tabIndex={0}
      className="flex gap-1.5 overflow-x-auto overscroll-x-contain pb-0.5 touch-pan-x scrollbar-none"
    >
      <button
        type="button"
        role="option"
        aria-selected={value === null}
        onClick={() => onChange(null)}
        className={cn(
          "min-h-9 shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold touch-manipulation transition-colors",
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
          role="option"
          aria-selected={value === c.id}
          onClick={() => onChange(c.id)}
          className={cn(
            "min-h-9 shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold touch-manipulation transition-colors",
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

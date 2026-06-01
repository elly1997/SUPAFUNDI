"use client";

import { ChevronDown, Search } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type SearchableSelectOption = {
  value: string;
  label: string;
  /** Extra text used for filtering (e.g. SKU, code). */
  keywords?: string;
  /** Right-aligned secondary text (e.g. stock on hand). */
  hint?: string;
};

type PanelPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

type Props = {
  options: SearchableSelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  emptyMessage?: string;
  className?: string;
  listClassName?: string;
  maxVisible?: number;
  /** Minimum width of the floating panel (px). */
  minPanelWidth?: number;
  /** Shown when `value` is set but not found in `options` (e.g. just created). */
  selectedLabel?: string;
};

const PANEL_Z = 120;
const PREFERRED_HEIGHT = 320;

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  disabled,
  emptyMessage = "No matches",
  className,
  listClassName,
  maxVisible = 80,
  minPanelWidth = 280,
  selectedLabel,
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(false);
  const [panelPos, setPanelPos] = useState<PanelPosition | null>(null);

  const selected = options.find((o) => o.value === value);
  const displayLabel =
    selected?.label ?? (value && selectedLabel ? selectedLabel : null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q
      ? options.filter((o) => {
          const hay = `${o.label} ${o.keywords ?? ""}`.toLowerCase();
          return hay.includes(q);
        })
      : options;
    return pool.slice(0, maxVisible);
  }, [options, query, maxVisible]);

  const updatePanelPosition = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = Math.max(rect.width, minPanelWidth);
    const margin = 8;
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;

    let top: number;
    let maxHeight: number;
    if (openUp) {
      maxHeight = Math.min(PREFERRED_HEIGHT, spaceAbove);
      top = Math.max(margin, rect.top - maxHeight - 4);
      maxHeight = rect.top - top - 4;
    } else {
      top = rect.bottom + 4;
      maxHeight = Math.min(PREFERRED_HEIGHT, spaceBelow);
    }

    const left = Math.min(
      Math.max(margin, rect.left),
      window.innerWidth - width - margin
    );

    setPanelPos({
      top,
      left,
      width,
      maxHeight: Math.max(120, maxHeight),
    });
  }, [minPanelWidth]);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open) {
      setPanelPos(null);
      return;
    }
    updatePanelPosition();
    const onScrollOrResize = () => updatePanelPosition();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        rootRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
      setQuery("");
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const panel =
    open && panelPos && mounted ? (
      <div
        ref={panelRef}
        id={listId}
        role="listbox"
        style={{
          position: "fixed",
          top: panelPos.top,
          left: panelPos.left,
          width: panelPos.width,
          maxHeight: panelPos.maxHeight,
          zIndex: PANEL_Z,
        }}
        className={cn(
          "flex flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl ring-1 ring-foreground/10",
          listClassName
        )}
      >
        <div className="shrink-0 border-b border-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 pl-8 text-sm"
              aria-label={searchPlaceholder}
              onKeyDown={(e) => {
                if (e.key === "Escape") close();
              }}
            />
          </div>
          {options.length > maxVisible && !query.trim() ? (
            <p className="mt-1.5 px-0.5 text-[10px] text-muted-foreground">
              Type to search {options.length.toLocaleString()} items
            </p>
          ) : null}
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <li className="px-2 py-3 text-center text-xs text-muted-foreground">
              {emptyMessage}
            </li>
          ) : (
            filtered.map((o) => (
              <li key={o.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                    o.value === value && "bg-primary/15 font-medium text-primary"
                  )}
                  onClick={() => {
                    onValueChange(o.value);
                    close();
                  }}
                >
                  <span className="min-w-0 truncate">{o.label}</span>
                  {o.hint ? (
                    <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                      {o.hint}
                    </span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    ) : null;

  return (
    <div ref={rootRef} className={cn("relative min-w-0", className)}>
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        className={cn(
          "flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 text-left text-sm transition-colors",
          "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "dark:bg-input/30 dark:hover:bg-input/50",
          !displayLabel && "text-muted-foreground",
          open && "border-primary ring-2 ring-primary/30"
        )}
        onClick={() => {
          if (disabled) return;
          if (open) close();
          else setOpen(true);
        }}
      >
        <span className="min-w-0 flex-1 truncate">
          {displayLabel ?? placeholder}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {mounted && panel ? createPortal(panel, document.body) : null}
    </div>
  );
}

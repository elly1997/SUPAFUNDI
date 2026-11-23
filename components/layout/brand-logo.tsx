import { Monitor } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  showTagline?: boolean;
  /** Smaller mark + title for POS counter chrome. */
  compact?: boolean;
  className?: string;
  href?: string;
};

export function BrandLogo({
  showTagline = true,
  compact = false,
  className,
  href = "/",
}: BrandLogoProps) {
  const inner = (
    <div
      className={cn(
        "flex min-w-0 items-center",
        compact ? "gap-2" : "gap-3",
        className
      )}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary-dark shadow-md shadow-primary/30",
          compact ? "size-7" : "size-9"
        )}
        aria-hidden
      >
        <Monitor
          className={cn(
            "text-primary-foreground",
            compact ? "size-3.5" : "size-5"
          )}
          strokeWidth={2}
        />
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            "block truncate font-bold leading-tight text-foreground",
            compact ? "text-xs" : "text-sm"
          )}
        >
          {compact ? "SUPAFUNDI" : "SUPAFUNDI TRADERS"}
        </span>
        {showTagline && !compact ? (
          <span className="block truncate text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
            Hardware Dealership • Wholesale &amp; Retail
          </span>
        ) : null}
      </span>
    </div>
  );


  if (href) {
    return (
      <Link
        href={href}
        className="shrink-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {inner}
      </Link>
    );
  }

  return inner;
}

import { Monitor } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  showTagline?: boolean;
  className?: string;
  href?: string;
};

export function BrandLogo({
  showTagline = true,
  className,
  href = "/",
}: BrandLogoProps) {
  const inner = (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary-dark shadow-md shadow-primary/30"
        aria-hidden
      >
        <Monitor className="size-5 text-primary-foreground" strokeWidth={2} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold leading-tight text-foreground">
          SUPAFUNDI TRADERS
        </span>
        {showTagline ? (
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

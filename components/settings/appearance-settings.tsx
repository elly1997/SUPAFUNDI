"use client";

import { Check, Moon, Monitor, Sun, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { applyTheme, getStoredTheme, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: {
  id: ThemeMode;
  label: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    id: "dark",
    label: "Dark",
    description: "Default counter look — easy on the eyes in the shop.",
    icon: Moon,
  },
  {
    id: "light",
    label: "Light",
    description: "Bright background for offices and daylight use.",
    icon: Sun,
  },
  {
    id: "system",
    label: "Match device",
    description: "Follow this phone, tablet, or PC setting.",
    icon: Monitor,
  },
];

export function AppearanceSettings() {
  const [mode, setMode] = useState<ThemeMode>("dark");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setMode(getStoredTheme());
    setReady(true);
  }, []);

  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  const choose = (next: ThemeMode) => {
    setMode(next);
    applyTheme(next);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Theme</CardTitle>
        <CardDescription>
          Saved on this device only. Other tablets and phones keep their own
          choice.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          role="radiogroup"
          aria-label="Theme"
          className="grid gap-3 sm:grid-cols-3"
        >
          {OPTIONS.map((opt) => {
            const selected = ready && mode === opt.id;
            const Icon = opt.icon;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => choose(opt.id)}
                className={cn(
                  "flex min-h-[7rem] flex-col rounded-xl border p-4 text-left touch-manipulation transition-colors",
                  selected
                    ? "border-primary/60 bg-primary/10 ring-2 ring-primary/30"
                    : "border-border bg-muted/20 hover:border-primary/40"
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "flex size-9 items-center justify-center rounded-lg",
                      selected
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                  </span>
                  {selected ? (
                    <Check className="size-4 text-primary" aria-hidden />
                  ) : null}
                </div>
                <p className="mt-3 text-sm font-semibold">{opt.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {opt.description}
                </p>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

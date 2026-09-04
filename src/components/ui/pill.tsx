import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "accent" | "spice";

const tones: Record<Tone, string> = {
  neutral: "bg-line-soft text-ink-muted",
  accent: "bg-accent-soft text-accent",
  spice: "bg-spice-soft text-spice",
};

export function Pill({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone], className)}
      {...props}
    />
  );
}

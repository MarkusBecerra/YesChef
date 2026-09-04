import Image from "next/image";
import { cn } from "@/lib/cn";

/** Recipe photo with a warm placeholder when there isn't one yet. Parent controls the aspect ratio. */
export function RecipePhoto({
  src,
  alt,
  sizes,
  priority,
  className,
}: {
  src: string | null;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative overflow-hidden bg-line-soft", className)}>
      {src ? (
        <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-ink-faint">
          <svg viewBox="0 0 64 64" className="size-1/3 max-h-16" fill="none" aria-hidden>
            <circle cx="28" cy="34" r="15" stroke="currentColor" strokeWidth="3" />
            <circle cx="28" cy="34" r="8" stroke="currentColor" strokeWidth="3" />
            <path d="M41 34h16" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
          </svg>
        </div>
      )}
    </div>
  );
}

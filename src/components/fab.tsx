import Link from "next/link";

/** Floating "add" button, bottom-right, clear of the phone's home indicator. */
export function Fab({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-30 inline-flex h-14 items-center gap-2 rounded-full bg-accent pl-4 pr-5 font-medium text-accent-ink shadow-card transition hover:brightness-110 active:scale-95"
    >
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
        <path d="M12 5v14M5 12h14" strokeLinecap="round" />
      </svg>
      {label}
    </Link>
  );
}

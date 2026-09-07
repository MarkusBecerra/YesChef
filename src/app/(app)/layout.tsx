import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireUser } from "@/lib/current-user";

// Everything behind the gate is personal, live data: never prerender it at build time.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const initial = user.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4">
          <Link href="/" className="font-display text-2xl font-semibold tracking-tight">
            YesChef
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Link
              href="/account"
              aria-label={`Account (${user.name})`}
              title={user.name}
              className="inline-flex size-9 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent transition hover:brightness-95"
            >
              {initial}
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4">
        {children}
      </main>
    </>
  );
}

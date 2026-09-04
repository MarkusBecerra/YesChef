import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <h1 className="font-display text-4xl font-semibold">Not found</h1>
      <p className="text-ink-muted">That page or recipe doesn&apos;t exist.</p>
      <Link href="/" className="text-sm font-medium text-accent underline-offset-4 hover:underline">
        Back to recipes
      </Link>
    </main>
  );
}

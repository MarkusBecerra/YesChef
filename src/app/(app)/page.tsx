export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-ink-muted">Personal recipe log</p>
      <h1 className="font-display text-5xl font-semibold tracking-tight">YesChef</h1>
      <p className="max-w-sm text-ink-muted">
        What I&apos;ve cooked, how it went, and what to cook next. The recipe list lands here soon.
      </p>
    </main>
  );
}

export default function Loading() {
  return (
    <div className="flex justify-center py-16" role="status" aria-label="Loading">
      <div className="size-8 animate-spin rounded-full border-2 border-line border-t-accent" />
    </div>
  );
}

/**
 * The one "the database is unreachable" alert.
 *
 * `loadPageData` produces the message; every page renders it the same way, so
 * a failure looks identical whether it happened on the board, the queue, the
 * list or the summary.
 */
export function PageLoadError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      {message}
    </p>
  );
}

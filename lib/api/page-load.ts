import { logFailure } from '@/lib/log';

/**
 * Load a page's data, or the message to show when the database is unreachable.
 *
 * The four server-rendered pages had the same try/catch, the same failure log
 * and the same alert; the shape lives here now. `PageLoadError` renders it.
 */
export type PageLoad<T> = {
  data: T | null;
  error: string | null;
};

export async function loadPageData<T>(
  details: { label: string; action: string; failure: string },
  load: () => Promise<T>,
): Promise<PageLoad<T>> {
  try {
    return { data: await load(), error: null };
  } catch (error) {
    logFailure(details.label, details.action, error);
    return { data: null, error: details.failure };
  }
}

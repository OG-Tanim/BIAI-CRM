/**
 * Read the operator-facing message out of a failed API response.
 *
 * Every client component talks to the same JSON error shape, so the parsing
 * lives here instead of once per form.
 */
export function messageFrom(payload: unknown, fallback: string): string {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    typeof (payload as { message?: unknown }).message === 'string'
  ) {
    const issues = (payload as { issues?: unknown }).issues;
    const detail =
      Array.isArray(issues) && issues.length > 0 ? ` ${issues.join('; ')}` : '';
    return `${(payload as { message: string }).message}${detail}`;
  }

  return fallback;
}

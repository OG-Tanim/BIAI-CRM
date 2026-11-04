/**
 * The one server-side failure line.
 *
 * Every handler logs the same shape — where it failed and why — so the only
 * thing that varies is the label. Keeping it here stops five copies of the
 * `error instanceof Error` dance from drifting apart.
 */

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

/** Log a failed operation as `[scope] action failed: reason`. */
export function logFailure(scope: string, action: string, error: unknown): void {
  console.error(`[${scope}] ${action} failed:`, describeError(error));
}

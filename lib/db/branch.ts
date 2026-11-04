export type DatabaseBranch = 'production' | 'testing';

type Env = Record<string, string | undefined>;

/**
 * Decide which Neon branch this process is allowed to talk to.
 *
 * Explicit configuration wins. Otherwise Vercel's environment tells us:
 * production deployments are production, previews are testing. Finally, when
 * both URLs are present and differ, an active DATABASE_URL is production.
 *
 * The fallback is `testing` on purpose: an unconfigured local process must
 * never fall through to live customer data.
 */
export function inferDatabaseBranch(env: Env = process.env): DatabaseBranch {
  const configured = env.DATABASE_BRANCH?.trim().toLowerCase();
  if (configured === 'production' || configured === 'testing') {
    return configured;
  }

  const vercelEnv = env.VERCEL_ENV?.trim().toLowerCase();
  if (vercelEnv === 'production') return 'production';
  if (vercelEnv === 'preview' || vercelEnv === 'development') return 'testing';

  if (
    env.DATABASE_URL &&
    env.TEST_DATABASE_URL &&
    env.DATABASE_URL !== env.TEST_DATABASE_URL
  ) {
    return 'production';
  }

  return 'testing';
}

/**
 * Resolve the connection string for the selected branch.
 *
 * The testing branch prefers TEST_DATABASE_URL but falls back to DATABASE_URL
 * because Vercel previews conventionally point DATABASE_URL at the testing
 * branch and never set a second variable.
 */
export function resolveDatabaseUrl(env: Env = process.env): string | null {
  if (inferDatabaseBranch(env) === 'testing') {
    return env.TEST_DATABASE_URL || env.DATABASE_URL || null;
  }

  return env.DATABASE_URL || env.TEST_DATABASE_URL || null;
}

/**
 * A connection string reduced to the database it actually points at.
 *
 * Credentials, query parameters and a trailing slash may differ between two
 * variables that still name the same database, so none of them count. The
 * protocol is normalised because `postgres:` and `postgresql:` are aliases.
 */
function normalizeConnection(value: string): string | null {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  const protocol =
    parsed.protocol === 'postgres:' || parsed.protocol === 'postgresql:'
      ? 'postgres'
      : null;

  if (!protocol || !parsed.hostname) return null;

  const port = parsed.port || '5432';
  const database = parsed.pathname.replace(/\/+$/, '') || '/';

  return `${protocol}://${parsed.hostname.toLowerCase()}:${port}${database}`;
}

export type SeedTarget =
  | { ok: true; url: string; host: string; database: string }
  | { ok: false; reason: string };

/**
 * Decide whether a seed run is allowed, before any connection is opened.
 *
 * The seed writes fiction. A mistyped variable filling the live branch with
 * twenty invented people is the worst mistake available in this design, so the
 * guard is deliberately suspicious:
 *
 * - the target must be requested explicitly as `test`; production is refused
 *   even when it is named;
 * - `DATABASE_BRANCH=production` refuses the run outright;
 * - the production URL must be present, so its absence cannot be mistaken for
 *   "no production to compare against";
 * - the testing URL must not resolve to the same host, port and database as
 *   the production URL.
 *
 * The returned host and database are what the script prints before writing.
 */
export function resolveSeedTarget(
  env: Env = process.env,
  requested?: string,
): SeedTarget {
  if (requested === 'production') {
    return {
      ok: false,
      reason:
        'refused: the seed writes demo data and has no production mode. Use --target test.',
    };
  }

  if (requested !== 'test') {
    return {
      ok: false,
      reason: 'usage: seed --target test [--reset]',
    };
  }

  if (env.DATABASE_BRANCH?.trim().toLowerCase() === 'production') {
    return {
      ok: false,
      reason:
        'refused: DATABASE_BRANCH=production. Set DATABASE_BRANCH=testing for the seed.',
    };
  }

  const testingUrl = env.TEST_DATABASE_URL?.trim();
  if (!testingUrl) {
    return {
      ok: false,
      reason:
        'refused: TEST_DATABASE_URL is not set. The seed never falls back to DATABASE_URL.',
    };
  }

  const productionUrl = env.DATABASE_URL?.trim();
  if (!productionUrl) {
    return {
      ok: false,
      reason:
        'refused: DATABASE_URL is not set, so the target cannot be proven different from production.',
    };
  }

  const testingConnection = normalizeConnection(testingUrl);
  if (!testingConnection) {
    return { ok: false, reason: 'refused: TEST_DATABASE_URL is not a valid URL.' };
  }

  const productionConnection = normalizeConnection(productionUrl);
  if (!productionConnection) {
    return {
      ok: false,
      reason:
        'refused: DATABASE_URL is not a valid URL, so production cannot be ruled out.',
    };
  }

  if (testingConnection === productionConnection) {
    return {
      ok: false,
      reason:
        'refused: TEST_DATABASE_URL resolves to the production connection string.',
    };
  }

  const parsed = new URL(testingUrl);

  return {
    ok: true,
    url: testingUrl,
    host: parsed.hostname,
    database: parsed.pathname.replace(/^\//, '') || '(default)',
  };
}

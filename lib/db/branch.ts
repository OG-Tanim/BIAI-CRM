export type DatabaseBranch = 'production' | 'testing';

type Env = Record<string, string | undefined>;

/**
 * A connection string reduced to the database it actually points at.
 *
 * Credentials, query parameters and a trailing slash may differ between two
 * variables that still name the same database, so none of them count. The
 * protocol is normalised because `postgres:` and `postgresql:` are aliases.
 */
export function databaseIdentity(value: string | null | undefined): string | null {
  if (!value) return null;

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

/** True when two connection strings name the same database, however written. */
export function sameDatabase(a: string, b: string): boolean {
  const left = databaseIdentity(a);
  const right = databaseIdentity(b);
  return left !== null && left === right;
}

export type ConnectionDescription = {
  host: string;
  port: string;
  database: string;
};

/** What a connection string points at, for the line a script prints first. */
export function describeConnection(value: string): ConnectionDescription | null {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  return {
    host: parsed.hostname,
    port: parsed.port || 'default',
    database: parsed.pathname.replace(/^\//, '') || '(default)',
  };
}

export type TargetConnection = {
  variable: 'TEST_DATABASE_URL' | 'DATABASE_URL';
  url: string;
};

/**
 * The connection a schema command may use, chosen by an explicit target.
 *
 * There is no fallback between branches: asking for production while only the
 * testing variable exists is a failure, not a guess.
 */
export function connectionForTarget(
  target: 'testing' | 'production',
  env: Env = process.env,
): TargetConnection | null {
  const variable = target === 'testing' ? 'TEST_DATABASE_URL' : 'DATABASE_URL';
  const url = env[variable]?.trim();

  return url ? { variable, url } : null;
}

export type DatabaseConnection = {
  branch: DatabaseBranch;
  url: string;
};

function branchForUrl(
  url: string,
  env: Env,
  fallback: DatabaseBranch,
): DatabaseBranch {
  const identity = databaseIdentity(url);
  const testingIdentity = databaseIdentity(env.TEST_DATABASE_URL?.trim());
  const productionIdentity = databaseIdentity(env.DATABASE_URL?.trim());

  if (identity && testingIdentity && identity === testingIdentity) {
    return 'testing';
  }
  if (identity && productionIdentity && identity === productionIdentity) {
    return 'production';
  }

  return fallback;
}

/**
 * Decide which branch this process talks to, and with which URL.
 *
 * The label is derived from the URL that will actually be opened, never from a
 * separate rule that can disagree with it: a process holding only
 * `DATABASE_URL` is a production process, because that variable is the
 * production one. `DATABASE_BRANCH` may name a branch explicitly, but it must
 * have the matching URL to back it up — an explicit `testing` with no
 * `TEST_DATABASE_URL` fails loudly instead of reading production under a
 * testing label.
 *
 * Explicit configuration wins. Otherwise Vercel's environment tells us:
 * production deployments are production, previews are testing.
 */
export function resolveDatabaseConnection(
  env: Env = process.env,
): DatabaseConnection | null {
  const configured = env.DATABASE_BRANCH?.trim().toLowerCase();
  const testingUrl = env.TEST_DATABASE_URL?.trim() || null;
  const productionUrl = env.DATABASE_URL?.trim() || null;
  const vercelEnv = env.VERCEL_ENV?.trim().toLowerCase();

  if (configured === 'production') {
    return productionUrl ? { branch: 'production', url: productionUrl } : null;
  }

  if (configured === 'testing') {
    return testingUrl ? { branch: 'testing', url: testingUrl } : null;
  }

  if (vercelEnv === 'production') {
    return productionUrl ? { branch: 'production', url: productionUrl } : null;
  }

  if (vercelEnv === 'preview' || vercelEnv === 'development') {
    const url = testingUrl ?? productionUrl;
    return url ? { branch: branchForUrl(url, env, 'testing'), url } : null;
  }

  if (testingUrl && productionUrl && testingUrl !== productionUrl) {
    return { branch: 'production', url: productionUrl };
  }

  if (testingUrl) return { branch: 'testing', url: testingUrl };

  // Only DATABASE_URL is set: that is the production variable. Reporting
  // `testing` here was the old lie — the app read production and said testing.
  if (productionUrl) return { branch: 'production', url: productionUrl };

  return null;
}

/** The branch this process talks to; `testing` is the reply when unconfigured. */
export function inferDatabaseBranch(env: Env = process.env): DatabaseBranch {
  return resolveDatabaseConnection(env)?.branch ?? 'testing';
}

/** The connection string for the resolved branch, or null when unconfigured. */
export function resolveDatabaseUrl(env: Env = process.env): string | null {
  return resolveDatabaseConnection(env)?.url ?? null;
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

  if (!databaseIdentity(testingUrl)) {
    return { ok: false, reason: 'refused: TEST_DATABASE_URL is not a valid URL.' };
  }

  if (!databaseIdentity(productionUrl)) {
    return {
      ok: false,
      reason:
        'refused: DATABASE_URL is not a valid URL, so production cannot be ruled out.',
    };
  }

  if (sameDatabase(testingUrl, productionUrl)) {
    return {
      ok: false,
      reason:
        'refused: TEST_DATABASE_URL resolves to the production connection string.',
    };
  }

  const described = describeConnection(testingUrl);
  if (!described) {
    return { ok: false, reason: 'refused: TEST_DATABASE_URL is not a valid URL.' };
  }

  return {
    ok: true,
    url: testingUrl,
    host: described.host,
    database: described.database,
  };
}

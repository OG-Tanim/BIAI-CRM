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

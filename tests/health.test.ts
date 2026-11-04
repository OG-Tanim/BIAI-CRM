import { describe, expect, it } from 'vitest';
import {
  inferDatabaseBranch,
  resolveDatabaseConnection,
  resolveSeedTarget,
} from '@/lib/db/branch';
import { createHealthHandler } from '@/lib/api/health';
import { GET as healthRoute } from '@/app/api/health/route';

describe('database branch selection', () => {
  it('reports the testing branch when it is configured', () => {
    expect(inferDatabaseBranch({ DATABASE_BRANCH: 'testing', TEST_DATABASE_URL: TESTING_URL })).toBe('testing');
  });

  it('labels a DATABASE_URL-only process as production, never testing', () => {
    const resolved = resolveDatabaseConnection({ DATABASE_URL: PRODUCTION_URL });

    expect(resolved).toEqual({ branch: 'production', url: PRODUCTION_URL });
    expect(inferDatabaseBranch({ DATABASE_URL: PRODUCTION_URL })).toBe('production');
  });

  it('refuses an explicit testing label without a testing URL', () => {
    expect(
      resolveDatabaseConnection({
        DATABASE_BRANCH: 'testing',
        DATABASE_URL: PRODUCTION_URL,
      }),
    ).toBeNull();
  });

  it('refuses an explicit production label without a production URL', () => {
    expect(
      resolveDatabaseConnection({
        DATABASE_BRANCH: 'production',
        TEST_DATABASE_URL: TESTING_URL,
      }),
    ).toBeNull();
  });
});

describe('GET /api/health', () => {
  it('answers with the branch and the row counts from its store', async () => {
    const handler = createHealthHandler({
      branch: () => 'testing',
      countRows: async () => ({ enquiries: 20, notes: 0 }),
    });

    const response = await handler();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      db: 'testing',
      tables: { enquiries: 20, notes: 0 },
    });
  });

  it('reports an unreachable database without throwing', async () => {
    const handler = createHealthHandler({
      branch: () => 'production',
      countRows: async () => {
        throw new Error('connection refused');
      },
    });

    const response = await handler();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      db: 'production',
      error: 'database_unreachable',
    });
  });

  it('is bound by the app route', () => {
    expect(typeof healthRoute).toBe('function');
  });
});

const PRODUCTION_URL =
  'postgresql://user:secret@production.example.com/neondb?sslmode=require';
const TESTING_URL =
  'postgresql://user:secret@testing.example.com/neondb?sslmode=require';

function env(overrides: Record<string, string | undefined> = {}) {
  return {
    DATABASE_BRANCH: 'testing',
    DATABASE_URL: PRODUCTION_URL,
    TEST_DATABASE_URL: TESTING_URL,
    ...overrides,
  };
}

/**
 * Seam 1: the production guard is a pure decision over environment variables,
 * so it is tested without opening a connection. The seed script only prints
 * what this function returns.
 */
describe('seed target guard', () => {
  it('accepts an explicit test target when the two branches differ', () => {
    expect(resolveSeedTarget(env(), 'test')).toEqual({
      ok: true,
      url: TESTING_URL,
      host: 'testing.example.com',
      database: 'neondb',
    });
  });

  it('refuses production even when it is named explicitly', () => {
    const target = resolveSeedTarget(env(), 'production');

    expect(target.ok).toBe(false);
    if (!target.ok) expect(target.reason).toContain('--target test');
  });

  it('refuses when no target is given', () => {
    const target = resolveSeedTarget(env());

    expect(target.ok).toBe(false);
    if (!target.ok) expect(target.reason).toContain('usage');
  });

  it('refuses when the test URL resolves to the production connection string', () => {
    const sameDatabase =
      'postgres://other:credentials@PRODUCTION.example.com/neondb/?sslmode=verify-full';
    const target = resolveSeedTarget(
      env({ TEST_DATABASE_URL: sameDatabase }),
      'test',
    );

    expect(target.ok).toBe(false);
    if (!target.ok) expect(target.reason).toContain('production connection string');
  });

  it('refuses when DATABASE_BRANCH says production', () => {
    const target = resolveSeedTarget(
      env({ DATABASE_BRANCH: 'production' }),
      'test',
    );

    expect(target.ok).toBe(false);
    if (!target.ok) expect(target.reason).toContain('DATABASE_BRANCH=production');
  });

  it('refuses when production cannot be ruled out', () => {
    const withoutProduction = resolveSeedTarget(
      env({ DATABASE_URL: undefined }),
      'test',
    );
    const withInvalidProduction = resolveSeedTarget(
      env({ DATABASE_URL: 'not-a-url' }),
      'test',
    );
    const withoutTesting = resolveSeedTarget(
      env({ TEST_DATABASE_URL: undefined }),
      'test',
    );

    expect(withoutProduction.ok).toBe(false);
    expect(withInvalidProduction.ok).toBe(false);
    expect(withoutTesting.ok).toBe(false);
  });
});

import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { drizzle } from 'drizzle-orm/postgres-js';
import { TransactionRollbackError } from 'drizzle-orm/errors';
import postgres from 'postgres';
import * as schema from '@/lib/db/schema';
import { sameDatabase } from '@/lib/db/branch';

/**
 * The shared database harness for seam-2 route tests.
 *
 * Every test runs inside a transaction that is rolled back, so the testing
 * branch is left exactly as it was found — including any demo data a later
 * session has seeded. The connection always comes from TEST_DATABASE_URL, and
 * the harness refuses to run when that is the production URL.
 */

for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) loadEnvFile(file);
}

const url = process.env.TEST_DATABASE_URL;

if (!url) {
  throw new Error(
    'TEST_DATABASE_URL is not set. Route tests need the throwaway testing branch.',
  );
}

if (
  process.env.DATABASE_URL &&
  sameDatabase(process.env.DATABASE_URL, url)
) {
  throw new Error(
    'DATABASE_URL and TEST_DATABASE_URL name the same database. Refusing to run route tests.',
  );
}

export const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 10 });
export const db = drizzle(sql, { schema });

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Run one test inside a transaction that always rolls back.
 *
 * `tx.rollback()` throws a control-flow error; the only acceptable error out of
 * this helper is that one. A real failure inside the test still fails the test.
 */
export async function withRollback(
  run: (tx: Tx) => Promise<void>,
): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await run(tx);
      tx.rollback();
    });
  } catch (error) {
    if (error instanceof TransactionRollbackError) return;
    throw error;
  }

  throw new Error('The test transaction did not roll back.');
}

export async function assertSchemaPresent(): Promise<void> {
  const found = await sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ('enquiries', 'notes')
  `;

  if (found.length !== 2) {
    throw new Error(
      'The testing branch is missing the enquiries/notes tables. Run pnpm db:push:test.',
    );
  }
}

export async function closeTestDatabase(): Promise<void> {
  await sql.end({ timeout: 5 });
}

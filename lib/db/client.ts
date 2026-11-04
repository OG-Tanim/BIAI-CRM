import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { inferDatabaseBranch, resolveDatabaseUrl } from './branch';
import * as schema from './schema';

type Database = PostgresJsDatabase<typeof schema>;

/**
 * One connection pool per process. Next.js reloads modules in development and
 * serverless invocations can share a warm process, so the singleton lives on
 * globalThis rather than in module scope.
 */
const globalForDb = globalThis as unknown as {
  __biaiSql?: Sql;
  __biaiDb?: Database;
};

function connectionString(): string {
  const url = resolveDatabaseUrl();
  if (!url) {
    throw new Error(
      'No database connection string configured. Set DATABASE_BRANCH and the matching DATABASE_URL or TEST_DATABASE_URL.',
    );
  }
  return url;
}

export function getSql(): Sql {
  if (!globalForDb.__biaiSql) {
    globalForDb.__biaiSql = postgres(connectionString(), {
      // Safe against Neon's pooler and against local Postgres.
      prepare: false,
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }

  return globalForDb.__biaiSql;
}

export function getDb(): Database {
  if (!globalForDb.__biaiDb) {
    globalForDb.__biaiDb = drizzle(getSql(), { schema });
  }

  return globalForDb.__biaiDb;
}

export function getDatabaseBranch() {
  return inferDatabaseBranch();
}

export async function closeDb(): Promise<void> {
  if (globalForDb.__biaiSql) {
    await globalForDb.__biaiSql.end({ timeout: 5 });
    delete globalForDb.__biaiSql;
    delete globalForDb.__biaiDb;
  }
}

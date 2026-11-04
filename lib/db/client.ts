import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import {
  resolveDatabaseConnection,
  type DatabaseBranch,
  type DatabaseConnection,
} from './branch';
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

function connection(): DatabaseConnection {
  const resolved = resolveDatabaseConnection();
  if (!resolved) {
    throw new Error(
      'No database connection string configured. Set DATABASE_BRANCH and the matching DATABASE_URL or TEST_DATABASE_URL.',
    );
  }
  return resolved;
}

export function getSql(): Sql {
  if (!globalForDb.__biaiSql) {
    globalForDb.__biaiSql = postgres(connection().url, {
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

/**
 * The branch that is actually connected. `unconfigured` is reported rather than
 * a guessed branch: health must never name a branch the process is not reading.
 */
export function getDatabaseBranch(): DatabaseBranch | 'unconfigured' {
  return resolveDatabaseConnection()?.branch ?? 'unconfigured';
}

export async function closeDb(): Promise<void> {
  if (globalForDb.__biaiSql) {
    await globalForDb.__biaiSql.end({ timeout: 5 });
    delete globalForDb.__biaiSql;
    delete globalForDb.__biaiDb;
  }
}

import { defineConfig } from 'drizzle-kit';
import { connectionForTarget } from './lib/db/branch';
import { loadEnv } from './scripts/env';

// drizzle-kit does not load .env files for us. Shell variables always win.
loadEnv();

// Default to testing. Writing production requires an explicit DB_TARGET and
// goes through scripts/db-push.ts, which prints and guards the target first.
const target = process.env.DB_TARGET === 'production' ? 'production' : 'testing';
const connection = connectionForTarget(target);

if (!connection) {
  throw new Error(
    `DB_TARGET=${target} requires ${
      target === 'production' ? 'DATABASE_URL' : 'TEST_DATABASE_URL'
    } to be set.`,
  );
}

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: connection.url },
  verbose: true,
  strict: true,
});

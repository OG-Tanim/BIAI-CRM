import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit does not load .env files for us. Shell variables always win.
for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) {
    loadEnvFile(file);
  }
}

// Default to testing. Writing production requires an explicit DB_TARGET and
// goes through scripts/db-push.mjs, which prints and guards the target first.
const target = process.env.DB_TARGET === 'production' ? 'production' : 'testing';
const url =
  target === 'production'
    ? process.env.DATABASE_URL
    : process.env.TEST_DATABASE_URL;

if (!url) {
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
  dbCredentials: { url },
  verbose: true,
  strict: true,
});

#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { loadEnv } from './load-env.mjs';

loadEnv();

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

const requested = valueAfter('--target');

if (requested !== 'test' && requested !== 'production') {
  console.error(
    'Usage: node scripts/db-push.mjs --target <test|production>\n' +
      '  test        push the schema to TEST_DATABASE_URL\n' +
      '  production  push the schema to DATABASE_URL (schema only, never data)',
  );
  process.exit(1);
}

const target = requested === 'test' ? 'testing' : 'production';
const url =
  target === 'testing'
    ? process.env.TEST_DATABASE_URL
    : process.env.DATABASE_URL;
const variable = target === 'testing' ? 'TEST_DATABASE_URL' : 'DATABASE_URL';

if (!url) {
  console.error(
    `[db:push] refused: ${variable} is not set. There is no fallback between branches.`,
  );
  process.exit(1);
}

if (
  process.env.DATABASE_URL &&
  process.env.TEST_DATABASE_URL &&
  process.env.DATABASE_URL === process.env.TEST_DATABASE_URL
) {
  console.error(
    '[db:push] refused: DATABASE_URL and TEST_DATABASE_URL are identical. Fix the environment before pushing.',
  );
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(url);
} catch {
  console.error(`[db:push] refused: ${variable} is not a valid URL.`);
  process.exit(1);
}

const database = parsed.pathname.replace(/^\//, '') || '(default)';

// The guard is printed before the write, not after it.
console.log(
  `[db:push] target=${target} variable=${variable} host=${parsed.hostname} port=${parsed.port || 'default'} database=${database}`,
);
console.log(`[db:push] pushing lib/db/schema.ts to the ${target} branch.`);

const pnpmEntrypoint = process.env.npm_execpath;
const command = pnpmEntrypoint ? process.execPath : 'pnpm';
const args = pnpmEntrypoint
  ? [pnpmEntrypoint, 'exec', 'drizzle-kit', 'push', '--force']
  : ['exec', 'drizzle-kit', 'push', '--force'];

const result = spawnSync(command, args, {
  stdio: 'inherit',
  env: { ...process.env, DB_TARGET: target },
});

if (result.error) {
  console.error('[db:push] failed to start drizzle-kit:', result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`[db:push] drizzle-kit exited with status ${result.status}.`);
  process.exit(result.status ?? 1);
}

console.log(`[db:push] ${target} branch updated.`);

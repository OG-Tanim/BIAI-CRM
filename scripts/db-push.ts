import { spawnSync } from 'node:child_process';
import {
  connectionForTarget,
  describeConnection,
  sameDatabase,
} from '@/lib/db/branch';
import { loadEnv } from './env';

loadEnv();

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

const requested = valueAfter('--target');

if (requested !== 'test' && requested !== 'production') {
  console.error(
    'Usage: tsx scripts/db-push.ts --target <test|production>\n' +
      '  test        push the schema to TEST_DATABASE_URL\n' +
      '  production  push the schema to DATABASE_URL (schema only, never data)',
  );
  process.exit(1);
}

const target = requested === 'test' ? 'testing' : 'production';
const connection = connectionForTarget(target);

if (!connection) {
  console.error(
    `[db:push] refused: ${
      target === 'testing' ? 'TEST_DATABASE_URL' : 'DATABASE_URL'
    } is not set. There is no fallback between branches.`,
  );
  process.exit(1);
}

// The two variables naming one database is an environment mistake either way,
// and the guard must agree with the seed's notion of "the same database", not
// compare raw strings.
const production = process.env.DATABASE_URL;
const testing = process.env.TEST_DATABASE_URL;

if (production && testing && sameDatabase(production, testing)) {
  console.error(
    '[db:push] refused: DATABASE_URL and TEST_DATABASE_URL name the same database. Fix the environment before pushing.',
  );
  process.exit(1);
}

const described = describeConnection(connection.url);

if (!described) {
  console.error(`[db:push] refused: ${connection.variable} is not a valid URL.`);
  process.exit(1);
}

// The guard is printed before the write, not after it.
console.log(
  `[db:push] target=${target} variable=${connection.variable} host=${described.host} port=${described.port} database=${described.database}`,
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

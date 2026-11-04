import postgres from 'postgres';
import {
  connectionForTarget,
  describeConnection,
  sameDatabase,
} from '@/lib/db/branch';
import { loadEnv } from './env';

loadEnv();

const REQUIRED_TABLES = ['enquiries', 'notes'];

type BranchCheck = {
  name: 'testing' | 'production';
  variable: 'TEST_DATABASE_URL' | 'DATABASE_URL';
  url: string | null;
  /** Only production is contractually empty; testing is where the samples live. */
  mustBeEmpty: boolean;
};

function branchChecks(): BranchCheck[] {
  const testing = connectionForTarget('testing');
  const production = connectionForTarget('production');

  return [
    {
      name: 'testing',
      variable: 'TEST_DATABASE_URL',
      url: testing?.url ?? null,
      mustBeEmpty: false,
    },
    {
      name: 'production',
      variable: 'DATABASE_URL',
      url: production?.url ?? null,
      mustBeEmpty: true,
    },
  ];
}

const branches = branchChecks();

if (
  branches[0]!.url &&
  branches[1]!.url &&
  sameDatabase(branches[0]!.url, branches[1]!.url)
) {
  console.error(
    '[db:verify] refused: DATABASE_URL and TEST_DATABASE_URL name the same database.',
  );
  process.exit(1);
}

let failed = false;

for (const branch of branches) {
  if (!branch.url) {
    console.error(`[db:verify] ${branch.name}: ${branch.variable} is not set.`);
    failed = true;
    continue;
  }

  const described = describeConnection(branch.url);
  console.log(
    `[db:verify] ${branch.name}: host=${described?.host ?? '?'} port=${described?.port ?? '?'} database=${described?.database ?? '?'}`,
  );

  const sql = postgres(branch.url, {
    prepare: false,
    max: 1,
    connect_timeout: 10,
  });

  try {
    const tables = await sql`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in ('enquiries', 'notes')
      order by table_name
    `;

    const found = tables.map((row) => row.table_name);
    const missing = REQUIRED_TABLES.filter((table) => !found.includes(table));

    if (missing.length > 0) {
      console.error(`[db:verify] ${branch.name}: missing tables ${missing.join(', ')}`);
      failed = true;
    }

    let counts = null;
    let branchOk = missing.length === 0;

    if (missing.length === 0) {
      const [row] = await sql`
        select
          (select count(*)::int from enquiries) as enquiries,
          (select count(*)::int from notes) as notes
      `;
      counts = { enquiries: row.enquiries, notes: row.notes };

      if (branch.mustBeEmpty && (counts.enquiries !== 0 || counts.notes !== 0)) {
        console.error(
          `[db:verify] ${branch.name}: production must hold zero rows, found enquiries=${counts.enquiries} notes=${counts.notes}`,
        );
        branchOk = false;
      }
    }

    if (!branchOk) failed = true;

    console.log(
      `  tables=${found.join(',') || '(none)'} enquiries=${counts?.enquiries ?? '?'} notes=${counts?.notes ?? '?'} ${
        branchOk ? 'OK' : 'FAIL'
      }`,
    );
  } catch (error) {
    console.error(
      `[db:verify] ${branch.name}: ${error instanceof Error ? error.message : 'connection failed'}`,
    );
    failed = true;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (failed) {
  console.error('[db:verify] one or more branches failed verification.');
  process.exit(1);
}

console.log(
  '[db:verify] both branches carry both tables; production holds zero rows.',
);

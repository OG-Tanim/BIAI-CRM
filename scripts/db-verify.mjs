#!/usr/bin/env node
import postgres from 'postgres';
import { loadEnv } from './load-env.mjs';

loadEnv();

const REQUIRED_TABLES = ['enquiries', 'notes'];

const branches = [
  { name: 'testing', variable: 'TEST_DATABASE_URL', url: process.env.TEST_DATABASE_URL },
  {
    name: 'production',
    variable: 'DATABASE_URL',
    url: process.env.DATABASE_URL,
  },
];

if (branches[0].url && branches[0].url === branches[1].url) {
  console.error(
    '[db:verify] refused: DATABASE_URL and TEST_DATABASE_URL are identical.',
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

  const parsed = new URL(branch.url);
  const database = parsed.pathname.replace(/^\//, '') || '(default)';
  console.log(
    `[db:verify] ${branch.name}: host=${parsed.hostname} port=${parsed.port || 'default'} database=${database}`,
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
    if (missing.length === 0) {
      const [row] = await sql`
        select
          (select count(*)::int from enquiries) as enquiries,
          (select count(*)::int from notes) as notes
      `;
      counts = { enquiries: row.enquiries, notes: row.notes };

      if (counts.enquiries !== 0 || counts.notes !== 0) {
        console.error(
          `[db:verify] ${branch.name}: expected zero rows, found enquiries=${counts.enquiries} notes=${counts.notes}`,
        );
        failed = true;
      }
    }

    console.log(
      `  tables=${found.join(',') || '(none)'} enquiries=${counts?.enquiries ?? '?'} notes=${counts?.notes ?? '?'} ${missing.length === 0 && counts && counts.enquiries === 0 && counts.notes === 0 ? 'OK' : 'FAIL'}`,
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

console.log('[db:verify] both branches carry both tables and hold zero rows.');

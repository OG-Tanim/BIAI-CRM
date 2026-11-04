import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { fetchFollowUps } from '@/lib/api/reminders';
import { loadPipeline } from '@/lib/api/pipeline';
import { loadSummaryFacts } from '@/lib/api/summary';
import { resolveSeedTarget } from '@/lib/db/branch';
import * as schema from '@/lib/db/schema';
import { enquiries, notes } from '@/lib/db/schema';
import { loadEnv } from './env';
import {
  SAMPLE_ENQUIRIES,
  expectationFor,
  seedEnquiryValues,
} from './sample-data';

/**
 * Seed the testing branch with the twenty sample enquiries.
 *
 * This is deliberately the only writer of fictional people. The guard runs
 * before a connection is opened, the target is printed before anything is
 * written, and the script refuses to touch a non-empty branch unless the
 * caller asks for `--reset`.
 *
 *   pnpm db:seed --target test
 *   pnpm db:seed --target test --reset
 */

loadEnv();

const FOLLOW_UP_WINDOW_MS = 48 * 60 * 60 * 1000;

class SeedError extends Error {}

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function expectedLeads(): number {
  return SAMPLE_ENQUIRIES.filter(
    (sample) => expectationFor(sample.id).kind === 'sales_lead',
  ).length;
}

async function main(): Promise<void> {
  const reset = process.argv.includes('--reset');
  const target = resolveSeedTarget(process.env, valueAfter('--target'));

  if (!target.ok) {
    console.error(`[db:seed] ${target.reason}`);
    process.exitCode = 1;
    return;
  }

  const host = target.host;
  const database = target.database;

  // Printed before the connection is useful for anything else.
  console.log(
    `[db:seed] target=testing variable=TEST_DATABASE_URL host=${host} database=${database}`,
  );
  if (reset) {
    console.log(
      '[db:seed] --reset: notes and enquiries on the testing branch will be deleted first.',
    );
  }

  const client = postgres(target.url, {
    prepare: false,
    max: 1,
    connect_timeout: 10,
  });
  const db = drizzle(client, { schema });

  try {
    const foundTables = await client`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in ('enquiries', 'notes')
    `;

    if (foundTables.length !== 2) {
      throw new SeedError(
        'The testing branch is missing enquiries/notes. Run pnpm db:push:test.',
      );
    }

    const [existing] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(enquiries);
    const existingCount = Number(existing?.count ?? 0);

    if (existingCount > 0 && !reset) {
      throw new SeedError(
        `The testing branch already holds ${existingCount} enquiries. Re-run with --reset to replace them with the twenty samples.`,
      );
    }

    console.log(
      `[db:seed] writing ${SAMPLE_ENQUIRIES.length} sample enquiries (created 2026-10-26 and 27, Asia/Dhaka).`,
    );

    const rows = SAMPLE_ENQUIRIES.map(seedEnquiryValues);

    await db.transaction(async (tx) => {
      if (reset) {
        // notes first: the cascade would do it, but the order stays visible.
        await tx.delete(notes);
        await tx.delete(enquiries);
      }

      await tx.insert(enquiries).values(rows);
    });

    const [inserted] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(enquiries);

    const now = new Date();
    const pipeline = await loadPipeline(db, now);
    const queue = await fetchFollowUps(db, now);
    const summary = await loadSummaryFacts(db, now);

    const leads = expectedLeads();
    const leadsByStatus = Object.values(summary.leads_by_status).reduce(
      (sum, count) => sum + count,
      0,
    );
    const queueCutoff = now.getTime() - FOLLOW_UP_WINDOW_MS;
    const queueExpected = rows.filter((row) => {
      if (row.kind !== 'sales_lead') return false;
      if (row.status !== 'new' && row.status !== 'contacted') return false;

      const basis = row.lastContactedAt ?? row.createdAt;
      return basis instanceof Date && basis.getTime() <= queueCutoff;
    }).length;

    console.log(
      `[db:seed] inserted ${Number(inserted?.count ?? 0)} enquiries; ${leads} are sales leads and ${SAMPLE_ENQUIRIES.length - leads} are not.`,
    );
    console.log(
      `[db:seed] board: ${pipeline.total} leads — ${pipeline.columns
        .map((column) => `${column.label} ${column.count}`)
        .join(', ')}`,
    );
    console.log(`[db:seed] follow-up queue: ${queue.total} overdue`);
    console.log(
      `[db:seed] summary: received=${summary.received} moved=${summary.moved} stuck=${summary.stuck} leads=${leadsByStatus}`,
    );

    const problems: string[] = [];
    const insertedCount = Number(inserted?.count ?? 0);

    if (insertedCount !== SAMPLE_ENQUIRIES.length) {
      problems.push(
        `expected ${SAMPLE_ENQUIRIES.length} rows after seeding, found ${insertedCount}.`,
      );
    }
    if (pipeline.total !== leads) {
      problems.push(`board shows ${pipeline.total} leads, expected ${leads}.`);
    }
    if (leadsByStatus !== leads) {
      problems.push(
        `summary counts ${leadsByStatus} leads by status, expected ${leads}.`,
      );
    }
    if (queue.total !== queueExpected) {
      problems.push(
        `follow-up queue shows ${queue.total}, expected ${queueExpected}.`,
      );
    }
    if (summary.stuck !== queueExpected) {
      problems.push(
        `summary counts ${summary.stuck} stuck, expected ${queueExpected}.`,
      );
    }

    if (problems.length > 0) {
      throw new SeedError(
        `seeded data did not produce the expected views:\n- ${problems.join('\n- ')}`,
      );
    }

    console.log('[db:seed] testing branch seeded and its three views verified.');
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error(
    `[db:seed] ${error instanceof Error ? error.message : 'seed failed.'}`,
  );
  process.exitCode = 1;
});

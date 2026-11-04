import { NextResponse } from 'next/server';
import { eq, gte, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { AiUnavailableError } from '@/lib/ai/extractor';
import {
  getSummaryNarrator,
  type SummaryNarrator,
} from '@/lib/ai/summary';
import { getDb } from '@/lib/db/client';
import { enquiries } from '@/lib/db/schema';
import type * as schema from '@/lib/db/schema';
import {
  emptyKindCounts,
  emptyStatusCounts,
  renderSummaryNarration,
  SUMMARY_WINDOW_DAYS,
  summaryWindow,
  SummaryNarrationError,
  type SummaryFacts,
} from '@/lib/domain/summary';
import { followUpCutoff } from '@/lib/domain/follow-up';
import type { Kind, Status } from '@/lib/domain/enquiry';
import { logFailure } from '@/lib/log';

type Database = PostgresJsDatabase<typeof schema>;

/** The weekly aggregate is a read. */
type SummaryStore = Pick<Database, 'select'>;

export type WeeklySummaryResponse = {
  facts: SummaryFacts;
  narrative: string;
};

/**
 * Compute the week's counts in the database.
 *
 * The route, the page and the tests all use this one function, so "what the
 * summary says" and "what the database counted" cannot drift apart. Every
 * number in `facts` comes from SQL; the narrator only sees the finished
 * object.
 *
 * `moved` counts status moves, not touches: `updated_at` is stamped only when
 * a card changes status, so a note, an attention flag or a reply edit cannot
 * inflate the week.
 */
export async function loadSummaryFacts(
  db: SummaryStore,
  now: Date = new Date(),
): Promise<SummaryFacts> {
  const { from, to } = summaryWindow(now);
  const cutoff = followUpCutoff(now);
  const fromIso = from.toISOString();
  const cutoffIso = cutoff.toISOString();

  const [totals] = await db
    .select({
      received: sql<number>`count(*) filter (where ${enquiries.createdAt} >= ${fromIso}::timestamptz)::int`,
      moved: sql<number>`count(*) filter (
        where ${enquiries.updatedAt} >= ${fromIso}::timestamptz
          and ${enquiries.status} <> 'new'
          and ${enquiries.kind} = 'sales_lead'
      )::int`,
      stuck: sql<number>`count(*) filter (
        where ${enquiries.kind} = 'sales_lead'
          and ${enquiries.status} in ('new', 'contacted')
          and coalesce(${enquiries.lastContactedAt}, ${enquiries.createdAt}) <= ${cutoffIso}::timestamptz
      )::int`,
    })
    .from(enquiries);

  if (!totals) {
    throw new Error('The summary aggregate returned no row.');
  }

  const kindRows = await db
    .select({
      kind: enquiries.kind,
      count: sql<number>`count(*)::int`,
    })
    .from(enquiries)
    .where(gte(enquiries.createdAt, from))
    .groupBy(enquiries.kind);

  const statusRows = await db
    .select({
      status: enquiries.status,
      count: sql<number>`count(*)::int`,
    })
    .from(enquiries)
    .where(eq(enquiries.kind, 'sales_lead'))
    .groupBy(enquiries.status);

  const receivedByKind = emptyKindCounts();
  for (const row of kindRows) {
    receivedByKind[row.kind as Kind] = Number(row.count);
  }

  const leadsByStatus = emptyStatusCounts();
  for (const row of statusRows) {
    leadsByStatus[row.status as Status] = Number(row.count);
  }

  return {
    window: {
      days: SUMMARY_WINDOW_DAYS,
      from: from.toISOString(),
      to: to.toISOString(),
    },
    received: Number(totals.received),
    received_by_kind: receivedByKind,
    moved: Number(totals.moved),
    stuck: Number(totals.stuck),
    leads_by_status: leadsByStatus,
    generated_at: now.toISOString(),
  };
}

/**
 * `POST /api/summary` — the seven-day aggregate plus its narration.
 *
 * The narrator is injected for route tests. A database failure is a 500; an
 * AI failure still returns the facts in the error body, because the counts are
 * true whether or not the prose could be written.
 */
export function createSummaryHandler(
  options: {
    db?: SummaryStore;
    now?: () => Date;
    narrator?: SummaryNarrator;
  } = {},
) {
  return async function POST(): Promise<NextResponse> {
    const db = options.db ?? getDb();
    const now = options.now?.() ?? new Date();
    const narrator = options.narrator ?? getSummaryNarrator();

    let facts: SummaryFacts;

    try {
      facts = await loadSummaryFacts(db, now);
    } catch (error) {
      logFailure('summary', 'aggregate', error);

      return NextResponse.json(
        {
          error: 'summary_failed',
          message: 'Could not compute the weekly summary.',
        },
        { status: 500 },
      );
    }

    try {
      const template = await narrator.narrate(facts);

      return NextResponse.json({
        facts,
        narrative: renderSummaryNarration(template, facts),
      });
    } catch (error) {
      if (error instanceof AiUnavailableError) {
        logFailure('summary', 'narrate', error);

        return NextResponse.json(
          {
            error: 'ai_unavailable',
            message: 'AI summary narration is unavailable.',
            facts,
          },
          { status: 503 },
        );
      }

      if (error instanceof SummaryNarrationError) {
        logFailure('summary', 'narration', error);

        return NextResponse.json(
          {
            error: 'invalid_narration',
            message: 'The AI summary did not match the narration contract.',
            issues: error.issues,
            facts,
          },
          { status: 502 },
        );
      }

      logFailure('summary', 'narrate', error);

      return NextResponse.json(
        {
          error: 'ai_failed',
          message: 'AI summary narration failed. Try again.',
          facts,
        },
        { status: 502 },
      );
    }
  };
}

export type SummaryHandler = ReturnType<typeof createSummaryHandler>;

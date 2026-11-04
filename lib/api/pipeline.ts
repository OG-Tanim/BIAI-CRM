import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { getDb } from '@/lib/db/client';
import { enquiries } from '@/lib/db/schema';
import type * as schema from '@/lib/db/schema';
import {
  STATUSES,
  STATUS_LABELS,
  type Interest,
  type Kind,
  type Status,
} from '@/lib/domain/enquiry';

type Database = PostgresJsDatabase<typeof schema>;

/** Only a read is needed to build a board. */
type PipelineStore = Pick<Database, 'select'>;

/**
 * The five columns, in the order an operator reads a pipeline. The board never
 * invents a status and never hides one: every column is always present.
 */
export const PIPELINE_COLUMNS: ReadonlyArray<{
  status: Status;
  label: string;
}> = STATUSES.map((status) => ({ status, label: STATUS_LABELS[status] }));

/** The fields a card shows. `age_seconds` is measured in the current status. */
export type PipelineCard = {
  id: string;
  name: string;
  company: string | null;
  job_title: string | null;
  phone: string | null;
  interest: Interest;
  kind: Kind;
  status: Status;
  needs_attention: boolean;
  summary: string;
  created_at: string;
  last_contacted_at: string | null;
  status_since: string;
  age_seconds: number;
};

export type PipelineColumn = {
  status: Status;
  label: string;
  count: number;
  cards: PipelineCard[];
};

export type PipelineResponse = {
  columns: PipelineColumn[];
  total: number;
  generated_at: string;
};

function toCard(row: typeof enquiries.$inferSelect, now: Date): PipelineCard {
  // A move stamps last_contacted_at, so this is the moment the card entered
  // its current status. A card that never moved has been here since creation.
  const statusSince = row.lastContactedAt ?? row.createdAt;
  const ageSeconds = Math.max(
    0,
    Math.floor((now.getTime() - statusSince.getTime()) / 1000),
  );

  return {
    id: row.id,
    name: row.name,
    company: row.company,
    job_title: row.jobTitle,
    phone: row.phone,
    interest: row.interest as Interest,
    kind: row.kind as Kind,
    status: row.status as Status,
    needs_attention: row.needsAttention,
    summary: row.summary,
    created_at: row.createdAt.toISOString(),
    last_contacted_at: row.lastContactedAt?.toISOString() ?? null,
    status_since: statusSince.toISOString(),
    age_seconds: ageSeconds,
  };
}

/**
 * Load the board.
 *
 * Non-leads are removed by the SQL query, not by a filter in the view: a spam
 * message, a job seeker or a support enquiry is not a deal, and it must not
 * even travel to the page. Only `sales_lead` rows are selected.
 */
export async function loadPipeline(
  db: PipelineStore,
  now: Date = new Date(),
): Promise<PipelineResponse> {
  const rows = await db
    .select()
    .from(enquiries)
    .where(eq(enquiries.kind, 'sales_lead'))
    // Stalest first, so the card that has waited longest is easiest to see.
    .orderBy(sql`coalesce(${enquiries.lastContactedAt}, ${enquiries.createdAt}) asc`);

  const cardsByStatus = new Map<Status, PipelineCard[]>(
    STATUSES.map((status) => [status, []]),
  );

  for (const row of rows) {
    const card = toCard(row, now);
    cardsByStatus.get(card.status)?.push(card);
  }

  const columns = PIPELINE_COLUMNS.map((column) => {
    const cards = cardsByStatus.get(column.status) ?? [];
    return { ...column, count: cards.length, cards };
  });

  return {
    columns,
    total: columns.reduce((sum, column) => sum + column.count, 0),
    generated_at: now.toISOString(),
  };
}

/**
 * `GET /api/pipeline` — the five-column board.
 *
 * The clock is injectable so a route test can assert exactly what a move
 * stamped without depending on wall time.
 */
export function createPipelineHandler(
  options: { db?: PipelineStore; now?: () => Date } = {},
) {
  return async function GET(): Promise<NextResponse> {
    const db = options.db ?? getDb();
    const now = options.now?.() ?? new Date();

    try {
      const pipeline = await loadPipeline(db, now);
      return NextResponse.json(pipeline);
    } catch (error) {
      console.error(
        '[pipeline] load failed:',
        error instanceof Error ? error.message : 'unknown error',
      );

      return NextResponse.json(
        { error: 'pipeline_failed', message: 'Could not load the pipeline.' },
        { status: 500 },
      );
    }
  };
}

export type PipelineHandler = ReturnType<typeof createPipelineHandler>;

import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { getDb } from '@/lib/db/client';
import { enquiries, type Enquiry } from '@/lib/db/schema';
import type * as schema from '@/lib/db/schema';
import { toEnquiryDto, type EnquiryDto } from '@/lib/api/enquiry-dto';
import { STATUSES, type Status } from '@/lib/domain/enquiry';
import { followUpAgeSeconds } from '@/lib/domain/follow-up';
import { STATUS_LABELS } from '@/lib/format';
import { logFailure } from '@/lib/log';

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

/** The fields a card shows — a projection of the enquiry DTO, not a second row mapper. */
export type PipelineCard = Pick<
  EnquiryDto,
  | 'id'
  | 'name'
  | 'company'
  | 'job_title'
  | 'phone'
  | 'interest'
  | 'kind'
  | 'status'
  | 'needs_attention'
  | 'summary'
  | 'last_contacted_at'
> & {
  /** Seconds since the last contact, or since creation when there was none. */
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

function toCard(row: Enquiry, now: Date): PipelineCard {
  const enquiry = toEnquiryDto(row);

  // The same clock the 48-hour rule uses: the last time the person was reached,
  // or creation when nobody has reached them yet. This is not time-in-status;
  // the schema has no column for that and the spec does not ask for one.
  const ageSeconds = followUpAgeSeconds(
    { createdAt: row.createdAt, lastContactedAt: row.lastContactedAt },
    now,
  );

  return {
    id: enquiry.id,
    name: enquiry.name,
    company: enquiry.company,
    job_title: enquiry.job_title,
    phone: enquiry.phone,
    interest: enquiry.interest,
    kind: enquiry.kind,
    status: enquiry.status,
    needs_attention: enquiry.needs_attention,
    summary: enquiry.summary,
    last_contacted_at: enquiry.last_contacted_at,
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
      logFailure('pipeline', 'load', error);

      return NextResponse.json(
        { error: 'pipeline_failed', message: 'Could not load the pipeline.' },
        { status: 500 },
      );
    }
  };
}

export type PipelineHandler = ReturnType<typeof createPipelineHandler>;

import { NextResponse } from 'next/server';
import { and, asc, desc, eq, ne } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { getDb } from '@/lib/db/client';
import { enquiries, notes, type Enquiry, type Note } from '@/lib/db/schema';
import type * as schema from '@/lib/db/schema';
import {
  EnquiryValidationError,
  KINDS,
  STATUSES,
  StatusChangeValidationError,
  applyStatusChange,
  prepareEnquiry,
  type Channel,
  type Interest,
  type Kind,
  type ReplyLanguage,
  type Status,
} from '@/lib/domain/enquiry';

type Database = PostgresJsDatabase<typeof schema>;

/**
 * The two database operations a save needs. Keeping the option structural lets
 * tests pass a transaction, which rolls back and leaves the branch untouched.
 */
type EnquiryStore = Pick<Database, 'insert' | 'select'>;

/**
 * The saved enquiry in the same snake_case the extraction payload uses, so the
 * capture screen can move a proposal into the database without translating
 * every key by hand.
 */
export type EnquiryDto = {
  id: string;
  name: string;
  company: string | null;
  job_title: string | null;
  phone: string | null;
  channel: Channel;
  channel_handle: string | null;
  interest: Interest;
  kind: Kind;
  status: Status;
  needs_attention: boolean;
  summary: string;
  raw_message: string;
  suggested_reply: string;
  reply_filled: string | null;
  reply_language: ReplyLanguage;
  created_at: string;
  last_contacted_at: string | null;
  updated_at: string;
};

/** Enough of the earlier enquiry to warn an operator without opening it. */
export type DuplicateSummary = {
  id: string;
  name: string;
  status: Status;
  created_at: string;
};

export type SaveEnquiryResponse = {
  enquiry: EnquiryDto;
  duplicateOf: DuplicateSummary | null;
};

function toEnquiryDto(row: Enquiry): EnquiryDto {
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    job_title: row.jobTitle,
    phone: row.phone,
    channel: row.channel as Channel,
    channel_handle: row.channelHandle,
    interest: row.interest as Interest,
    kind: row.kind as Kind,
    status: row.status as Status,
    needs_attention: row.needsAttention,
    summary: row.summary,
    raw_message: row.rawMessage,
    suggested_reply: row.suggestedReply,
    reply_filled: row.replyFilled,
    reply_language: row.replyLanguage as ReplyLanguage,
    created_at: row.createdAt.toISOString(),
    last_contacted_at: row.lastContactedAt?.toISOString() ?? null,
    updated_at: row.updatedAt.toISOString(),
  };
}

async function findEarlierEnquiry(
  db: EnquiryStore,
  phone: string,
  savedId: string,
): Promise<DuplicateSummary | null> {
  try {
    const [earlier] = await db
      .select({
        id: enquiries.id,
        name: enquiries.name,
        status: enquiries.status,
        createdAt: enquiries.createdAt,
      })
      .from(enquiries)
      .where(and(eq(enquiries.phone, phone), ne(enquiries.id, savedId)))
      .orderBy(asc(enquiries.createdAt))
      .limit(1);

    if (!earlier) return null;

    return {
      id: earlier.id,
      name: earlier.name,
      status: earlier.status as Status,
      created_at: earlier.createdAt.toISOString(),
    };
  } catch (error) {
    // The save already happened. A failed warning query must not turn a
    // successful save into an error the operator would retry and duplicate.
    console.error(
      '[enquiries] duplicate lookup failed:',
      error instanceof Error ? error.message : 'unknown error',
    );
    return null;
  }
}

/**
 * `POST /api/enquiries` — save a reviewed proposal.
 *
 * One insert, always `new`. A phone number already on file produces a warning
 * naming the earlier enquiry; it never blocks the save.
 */
export function createEnquiriesHandler(options: { db?: EnquiryStore } = {}) {
  return async function POST(request: Request): Promise<NextResponse> {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'invalid_json', message: 'Request body must be JSON.' },
        { status: 400 },
      );
    }

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return NextResponse.json(
        { error: 'invalid_body', message: 'Request body must be a JSON object.' },
        { status: 400 },
      );
    }

    const rawMessage = (body as { raw_message?: unknown }).raw_message;

    if (typeof rawMessage !== 'string' || rawMessage.trim() === '') {
      return NextResponse.json(
        {
          error: 'raw_message_required',
          message: 'The original message is required and cannot be edited away.',
        },
        { status: 400 },
      );
    }

    let values: ReturnType<typeof prepareEnquiry>;

    try {
      values = prepareEnquiry(body, rawMessage);
    } catch (error) {
      if (!(error instanceof EnquiryValidationError)) throw error;

      return NextResponse.json(
        {
          error: 'invalid_enquiry',
          message: 'The reviewed enquiry did not match the contract.',
          issues: error.issues,
        },
        { status: 422 },
      );
    }

    const db = options.db ?? getDb();

    try {
      const [created] = await db.insert(enquiries).values(values).returning();

      if (!created) {
        return NextResponse.json(
          { error: 'save_failed', message: 'The enquiry was not saved.' },
          { status: 500 },
        );
      }

      const duplicateOf = values.phone
        ? await findEarlierEnquiry(db, values.phone, created.id)
        : null;

      const response: SaveEnquiryResponse = {
        enquiry: toEnquiryDto(created),
        duplicateOf,
      };

      return NextResponse.json(response, { status: 201 });
    } catch (error) {
      console.error(
        '[enquiries] save failed:',
        error instanceof Error ? error.message : 'unknown error',
      );

      return NextResponse.json(
        { error: 'save_failed', message: 'Could not save the enquiry.' },
        { status: 500 },
      );
    }
  };
}

export type SaveEnquiryHandler = ReturnType<typeof createEnquiriesHandler>;

type EnquiryListStore = Pick<Database, 'select'>;

export type EnquiryFilters = {
  status: Status | null;
  kind: Kind | null;
};

export type EnquiryListResponse = {
  enquiries: EnquiryDto[];
  total: number;
  filters: EnquiryFilters;
};

function oneOf<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
  field: string,
  issues: string[],
): T | null {
  if (value === undefined || value === null || value === '') return null;

  if (!(allowed as readonly string[]).includes(value)) {
    issues.push(`${field}: must be one of ${allowed.join(', ')}.`);
    return null;
  }

  return value as T;
}

/**
 * Read the list filters the way the page and the endpoint both receive them.
 *
 * An absent or empty parameter means "all". An unknown value is a reported
 * error rather than a silent fallback: a list that quietly ignores a filter
 * tells the operator they have seen everything when they have not.
 */
export function parseEnquiryFilters(input: {
  status?: string | null;
  kind?: string | null;
}): { filters: EnquiryFilters; issues: string[] } {
  const issues: string[] = [];

  const status = oneOf(input.status, STATUSES, 'status', issues);
  const kind = oneOf(input.kind, KINDS, 'kind', issues);

  return { filters: { status, kind }, issues };
}

/**
 * The list view is deliberately not the board: it shows every kind of
 * enquiry, because finding a support thread or a job seeker is a legitimate
 * reason to leave the pipeline. The board's exclusion lives in
 * `loadPipeline`, not here.
 */
export async function fetchEnquiryList(
  db: EnquiryListStore,
  filters: EnquiryFilters,
): Promise<EnquiryListResponse> {
  const where =
    filters.status && filters.kind
      ? and(eq(enquiries.status, filters.status), eq(enquiries.kind, filters.kind))
      : filters.status
        ? eq(enquiries.status, filters.status)
        : filters.kind
          ? eq(enquiries.kind, filters.kind)
          : undefined;

  const rows = await db
    .select()
    .from(enquiries)
    .where(where)
    .orderBy(desc(enquiries.createdAt));

  return {
    enquiries: rows.map(toEnquiryDto),
    total: rows.length,
    filters,
  };
}

/** `GET /api/enquiries?status=&kind=` — the filterable list. */
export function createEnquiryListHandler(
  options: { db?: EnquiryListStore } = {},
) {
  return async function GET(request: Request): Promise<NextResponse> {
    const url = new URL(request.url);
    const { filters, issues } = parseEnquiryFilters({
      status: url.searchParams.get('status'),
      kind: url.searchParams.get('kind'),
    });

    if (issues.length > 0) {
      return NextResponse.json(
        {
          error: 'invalid_filter',
          message: 'The list filter is not valid.',
          issues,
        },
        { status: 400 },
      );
    }

    const db = options.db ?? getDb();

    try {
      return NextResponse.json(await fetchEnquiryList(db, filters));
    } catch (error) {
      console.error(
        '[enquiries] list failed:',
        error instanceof Error ? error.message : 'unknown error',
      );

      return NextResponse.json(
        { error: 'list_failed', message: 'Could not load the enquiry list.' },
        { status: 500 },
      );
    }
  };
}

export type NoteDto = {
  id: string;
  enquiry_id: string;
  body: string;
  created_at: string;
};

export type UpdateEnquiryResponse = {
  enquiry: EnquiryDto;
  note: NoteDto | null;
};

type EnquiryUpdateStore = Pick<Database, 'select' | 'update' | 'insert'>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toNoteDto(row: Note): NoteDto {
  return {
    id: row.id,
    enquiry_id: row.enquiryId,
    body: row.body,
    created_at: row.createdAt.toISOString(),
  };
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * `PATCH /api/enquiries/:id` — move a card and/or append a note.
 *
 * The status decision is made by `applyStatusChange`, not here: a move records
 * the new status and stamps `last_contacted_at`; a note alone does neither.
 * The note is written to its own table, and the response names both.
 */
export function createEnquiryUpdateHandler(
  options: { db?: EnquiryUpdateStore; now?: () => Date } = {},
) {
  return async function PATCH(
    request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> {
    const { id } = await context.params;

    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json(
        { error: 'not_found', message: 'No enquiry has that id.' },
        { status: 404 },
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'invalid_json', message: 'Request body must be JSON.' },
        { status: 400 },
      );
    }

    if (!isJsonObject(body)) {
      return NextResponse.json(
        { error: 'invalid_body', message: 'Request body must be a JSON object.' },
        { status: 400 },
      );
    }

    const db = options.db ?? getDb();
    const now = options.now?.() ?? new Date();

    try {
      const [current] = await db
        .select()
        .from(enquiries)
        .where(eq(enquiries.id, id))
        .limit(1);

      if (!current) {
        return NextResponse.json(
          { error: 'not_found', message: 'No enquiry has that id.' },
          { status: 404 },
        );
      }

      const decision = applyStatusChange(
        {
          status: current.status as Status,
          lastContactedAt: current.lastContactedAt,
        },
        { status: body.status, note: body.note },
        now,
      );

      if (!decision.changed) {
        return NextResponse.json(
          {
            error: 'nothing_to_update',
            message: 'Send a different status, a note, or both.',
          },
          { status: 422 },
        );
      }

      const [updated] = await db
        .update(enquiries)
        .set({
          status: decision.status,
          lastContactedAt: decision.lastContactedAt,
          updatedAt: now,
        })
        .where(eq(enquiries.id, id))
        .returning();

      if (!updated) {
        return NextResponse.json(
          { error: 'not_found', message: 'No enquiry has that id.' },
          { status: 404 },
        );
      }

      let note: NoteDto | null = null;

      if (decision.note !== null) {
        const [created] = await db
          .insert(notes)
          .values({ enquiryId: id, body: decision.note })
          .returning();

        if (created) note = toNoteDto(created);
      }

      const response: UpdateEnquiryResponse = {
        enquiry: toEnquiryDto(updated),
        note,
      };

      return NextResponse.json(response);
    } catch (error) {
      if (error instanceof StatusChangeValidationError) {
        return NextResponse.json(
          {
            error: 'invalid_status_change',
            message: 'The status change did not match the contract.',
            issues: error.issues,
          },
          { status: 422 },
        );
      }

      console.error(
        '[enquiries] update failed:',
        error instanceof Error ? error.message : 'unknown error',
      );

      return NextResponse.json(
        { error: 'update_failed', message: 'Could not update the enquiry.' },
        { status: 500 },
      );
    }
  };
}

export type EnquiryUpdateHandler = ReturnType<typeof createEnquiryUpdateHandler>;

import { NextResponse } from 'next/server';
import { and, asc, eq, ne } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { getDb } from '@/lib/db/client';
import { enquiries, type Enquiry } from '@/lib/db/schema';
import type * as schema from '@/lib/db/schema';
import {
  EnquiryValidationError,
  prepareEnquiry,
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
  channel: string;
  channel_handle: string | null;
  interest: string;
  kind: string;
  status: string;
  needs_attention: boolean;
  summary: string;
  raw_message: string;
  suggested_reply: string;
  reply_filled: string | null;
  reply_language: string;
  created_at: string;
  last_contacted_at: string | null;
  updated_at: string;
};

/** Enough of the earlier enquiry to warn an operator without opening it. */
export type DuplicateSummary = {
  id: string;
  name: string;
  status: string;
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
    channel: row.channel,
    channel_handle: row.channelHandle,
    interest: row.interest,
    kind: row.kind,
    status: row.status,
    needs_attention: row.needsAttention,
    summary: row.summary,
    raw_message: row.rawMessage,
    suggested_reply: row.suggestedReply,
    reply_filled: row.replyFilled,
    reply_language: row.replyLanguage,
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
      status: earlier.status,
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

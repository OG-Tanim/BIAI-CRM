import { NextResponse } from 'next/server';
import { and, asc, eq, ne } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { getDb } from '@/lib/db/client';
import { enquiries, type Enquiry } from '@/lib/db/schema';
import type * as schema from '@/lib/db/schema';
import { toEnquiryDto, type EnquiryDto } from '@/lib/api/enquiry-dto';
import { readJsonObject } from '@/lib/api/request-body';
import {
  EnquiryValidationError,
  prepareEnquiry,
  type Status,
} from '@/lib/domain/enquiry';
import { logFailure } from '@/lib/log';

type Database = PostgresJsDatabase<typeof schema>;

/**
 * The two database operations a save needs. Keeping the option structural lets
 * tests pass a transaction, which rolls back and leaves the branch untouched.
 */
type EnquiryStore = Pick<Database, 'insert' | 'select'>;

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
    logFailure('enquiries', 'duplicate lookup', error);
    return null;
  }
}

/**
 * `POST /api/enquiries` — save a reviewed proposal.
 *
 * One insert, always `new`: the capture form cannot choose a status, so a card
 * moves only when the operator moves it. A phone number
 * already on file produces a warning naming the earlier enquiry; it never
 * blocks the save.
 */
export function createEnquiriesHandler(options: { db?: EnquiryStore } = {}) {
  return async function POST(request: Request): Promise<NextResponse> {
    const parsed = await readJsonObject(request);

    if (!parsed.ok) return parsed.response;

    const body = parsed.body;
    const rawMessage = body.raw_message;

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
      logFailure('enquiries', 'save', error);

      return NextResponse.json(
        { error: 'save_failed', message: 'Could not save the enquiry.' },
        { status: 500 },
      );
    }
  };
}

export type SaveEnquiryHandler = ReturnType<typeof createEnquiriesHandler>;

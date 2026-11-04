import { NextResponse } from 'next/server';
import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { getDb } from '@/lib/db/client';
import { enquiries } from '@/lib/db/schema';
import type * as schema from '@/lib/db/schema';
import { toEnquiryDto, type EnquiryDto } from '@/lib/api/enquiry-dto';
import {
  FOLLOW_UP_HOURS,
  FOLLOW_UP_KIND,
  FOLLOW_UP_STATUSES,
  followUpAgeSeconds,
  followUpCutoff,
} from '@/lib/domain/follow-up';
import { logFailure } from '@/lib/log';

type Database = PostgresJsDatabase<typeof schema>;

/** Building the queue is a read. */
type RemindersStore = Pick<Database, 'select'>;

/** The fields a follow-up row shows, projected from the one enquiry DTO. */
export type FollowUpItem = Pick<
  EnquiryDto,
  | 'id'
  | 'name'
  | 'company'
  | 'job_title'
  | 'phone'
  | 'channel'
  | 'interest'
  | 'kind'
  | 'status'
  | 'needs_attention'
  | 'summary'
  | 'created_at'
  | 'last_contacted_at'
> & {
  /** The instant the 48-hour clock started: last contact, else creation. */
  waiting_since: string;
  age_seconds: number;
};

export type RemindersResponse = {
  enquiries: FollowUpItem[];
  total: number;
  rule: {
    hours: number;
    /** Last-contact-or-creation at or before this instant is overdue. */
    cutoff: string;
  };
  generated_at: string;
};

/**
 * The queue as the database returns it.
 *
 * The exclusions are part of the `WHERE`: only sales leads, only New or
 * Contacted, and only where `coalesce(last_contacted_at, created_at)` is at or
 * before the 48-hour cutoff. The page and the API never filter afterwards, so
 * a spam row or a paid deal does not even travel to the client. Oldest clock
 * first, so the person who has waited longest is at the top.
 */
export async function fetchFollowUps(
  db: RemindersStore,
  now: Date = new Date(),
): Promise<RemindersResponse> {
  const cutoff = followUpCutoff(now);
  const cutoffIso = cutoff.toISOString();
  const basis = sql`coalesce(${enquiries.lastContactedAt}, ${enquiries.createdAt})`;

  const rows = await db
    .select()
    .from(enquiries)
    .where(
      and(
        eq(enquiries.kind, FOLLOW_UP_KIND),
        inArray(enquiries.status, [...FOLLOW_UP_STATUSES]),
        // Raw SQL parameters reach postgres-js as-is, so the instant is sent
        // as an ISO string and cast explicitly; a Date here is not serialised.
        lte(basis, sql`${cutoffIso}::timestamptz`),
      ),
    )
    .orderBy(asc(basis));

  const items = rows.map((row): FollowUpItem => {
    const enquiry = toEnquiryDto(row);
    const waitingSince = row.lastContactedAt ?? row.createdAt;

    return {
      id: enquiry.id,
      name: enquiry.name,
      company: enquiry.company,
      job_title: enquiry.job_title,
      phone: enquiry.phone,
      channel: enquiry.channel,
      interest: enquiry.interest,
      kind: enquiry.kind,
      status: enquiry.status,
      needs_attention: enquiry.needs_attention,
      summary: enquiry.summary,
      created_at: enquiry.created_at,
      last_contacted_at: enquiry.last_contacted_at,
      waiting_since: waitingSince.toISOString(),
      age_seconds: followUpAgeSeconds(row, now),
    };
  });

  return {
    enquiries: items,
    total: items.length,
    rule: { hours: FOLLOW_UP_HOURS, cutoff: cutoff.toISOString() },
    generated_at: now.toISOString(),
  };
}

/** `GET /api/reminders` — the 48-hour follow-up queue. */
export function createRemindersHandler(
  options: { db?: RemindersStore; now?: () => Date } = {},
) {
  return async function GET(): Promise<NextResponse> {
    const db = options.db ?? getDb();
    const now = options.now?.() ?? new Date();

    try {
      return NextResponse.json(await fetchFollowUps(db, now));
    } catch (error) {
      logFailure('reminders', 'load', error);

      return NextResponse.json(
        {
          error: 'reminders_failed',
          message: 'Could not load the follow-up queue.',
        },
        { status: 500 },
      );
    }
  };
}

export type RemindersHandler = ReturnType<typeof createRemindersHandler>;

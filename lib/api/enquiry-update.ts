import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { getDb } from '@/lib/db/client';
import { enquiries, notes, type Note } from '@/lib/db/schema';
import type * as schema from '@/lib/db/schema';
import { toEnquiryDto, type EnquiryDto } from '@/lib/api/enquiry-dto';
import {
  StatusChangeValidationError,
  applyStatusChange,
  type Status,
} from '@/lib/domain/enquiry';
import { logFailure } from '@/lib/log';

type Database = PostgresJsDatabase<typeof schema>;

/**
 * Everything one card update touches. `transaction` is part of the contract
 * because a move and its note are one decision: a card must not end up moved
 * with the note that explained the move missing.
 */
type EnquiryUpdateStore = Pick<
  Database,
  'select' | 'update' | 'insert' | 'transaction'
>;

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
 * `PATCH /api/enquiries/:id` — move a card, append a note, flag attention.
 *
 * The decision is made by `applyStatusChange`, not here: leaving `new` records
 * the contact time, a later move does not, a note alone changes neither, and
 * the attention flag moves independently of the status. The row update and the
 * note insert share one transaction, so they land together or not at all.
 *
 * `suggested_reply` is deliberately not accepted: the template written at
 * capture is never overwritten, because the reply actually sent lives in its
 * own `reply_filled` column. No ticket asks to edit a template after save.
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
      const response = await db.transaction(
        async (tx): Promise<UpdateEnquiryResponse | 'not_found' | 'unchanged'> => {
          const [current] = await tx
            .select()
            .from(enquiries)
            .where(eq(enquiries.id, id))
            .limit(1);

          if (!current) return 'not_found';

          const decision = applyStatusChange(
            {
              status: current.status as Status,
              lastContactedAt: current.lastContactedAt,
              needsAttention: current.needsAttention,
            },
            {
              status: body.status,
              note: body.note,
              needs_attention: body.needs_attention,
            },
            now,
          );

          if (!decision.changed) return 'unchanged';

          const [updated] = await tx
            .update(enquiries)
            .set({
              status: decision.status,
              lastContactedAt: decision.lastContactedAt,
              needsAttention: decision.needsAttention,
              updatedAt: now,
            })
            .where(eq(enquiries.id, id))
            .returning();

          if (!updated) return 'not_found';

          if (decision.note === null) {
            return { enquiry: toEnquiryDto(updated), note: null };
          }

          const [created] = await tx
            .insert(notes)
            .values({ enquiryId: id, body: decision.note })
            .returning();

          if (!created) {
            // Roll the move back rather than report a note that was never kept.
            throw new Error('The note was not written.');
          }

          return { enquiry: toEnquiryDto(updated), note: toNoteDto(created) };
        },
      );

      if (response === 'not_found') {
        return NextResponse.json(
          { error: 'not_found', message: 'No enquiry has that id.' },
          { status: 404 },
        );
      }

      if (response === 'unchanged') {
        return NextResponse.json(
          {
            error: 'nothing_to_update',
            message:
              'Send a different status, a note, a different attention flag, or a combination.',
          },
          { status: 422 },
        );
      }

      return NextResponse.json(response);
    } catch (error) {
      if (error instanceof StatusChangeValidationError) {
        return NextResponse.json(
          {
            error: 'invalid_status_change',
            message: 'The card update did not match the contract.',
            issues: error.issues,
          },
          { status: 422 },
        );
      }

      logFailure('enquiries', 'update', error);

      return NextResponse.json(
        { error: 'update_failed', message: 'Could not update the enquiry.' },
        { status: 500 },
      );
    }
  };
}

export type EnquiryUpdateHandler = ReturnType<typeof createEnquiryUpdateHandler>;

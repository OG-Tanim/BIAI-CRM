import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { getDb } from '@/lib/db/client';
import { enquiries, notes } from '@/lib/db/schema';
import type * as schema from '@/lib/db/schema';
import { toEnquiryDto, type EnquiryDto } from '@/lib/api/enquiry-dto';
import { toNoteDto, type NoteDto } from '@/lib/api/note-dto';
import { isEnquiryId } from '@/lib/api/id';
import { readJsonObject } from '@/lib/api/request-body';
import {
  StatusChangeValidationError,
  applyReplyEdit,
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

export type UpdateEnquiryResponse = {
  enquiry: EnquiryDto;
  note: NoteDto | null;
};

/**
 * `PATCH /api/enquiries/:id` — move a card, append a note, flag attention or
 * edit the reply.
 *
 * The status decision is made by `applyStatusChange`, not here: leaving `new`
 * records the contact time, a later move does not, a note alone changes
 * neither, and the attention flag moves independently of the status. The reply
 * decision is made by `applyReplyEdit`, which keeps the template inside the
 * nine-token allowlist and keeps the filled text separate from it.
 *
 * The row update and the note insert share one transaction, so they land
 * together or not at all. `updated_at` moves only when the status does: the
 * weekly "moved" count means deals that changed stage, not rows that were
 * touched.
 */
export function createEnquiryUpdateHandler(
  options: { db?: EnquiryUpdateStore; now?: () => Date } = {},
) {
  return async function PATCH(
    request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> {
    const { id } = await context.params;

    if (!isEnquiryId(id)) {
      return NextResponse.json(
        { error: 'not_found', message: 'No enquiry has that id.' },
        { status: 404 },
      );
    }

    const parsed = await readJsonObject(request);

    if (!parsed.ok) return parsed.response;

    const body = parsed.body;

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

          const statusDecision = applyStatusChange(
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

          const replyDecision = applyReplyEdit(
            {
              suggestedReply: current.suggestedReply,
              replyFilled: current.replyFilled,
            },
            {
              suggested_reply: body.suggested_reply,
              reply_filled: body.reply_filled,
            },
          );

          if (!statusDecision.changed && !replyDecision.changed) {
            return 'unchanged';
          }

          const [updated] = await tx
            .update(enquiries)
            .set({
              status: statusDecision.status,
              lastContactedAt: statusDecision.lastContactedAt,
              needsAttention: statusDecision.needsAttention,
              suggestedReply: replyDecision.suggestedReply,
              replyFilled: replyDecision.replyFilled,
              ...(statusDecision.moved ? { updatedAt: now } : {}),
            })
            .where(eq(enquiries.id, id))
            .returning();

          if (!updated) return 'not_found';

          if (statusDecision.note === null) {
            return { enquiry: toEnquiryDto(updated), note: null };
          }

          const [created] = await tx
            .insert(notes)
            .values({ enquiryId: id, body: statusDecision.note })
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
              'Send a different status, a note, a different attention flag, an edited reply, or a combination.',
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

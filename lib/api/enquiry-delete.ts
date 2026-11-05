import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { getDb } from '@/lib/db/client';
import { enquiries } from '@/lib/db/schema';
import type * as schema from '@/lib/db/schema';
import { isEnquiryId } from '@/lib/api/id';
import { logFailure } from '@/lib/log';

type Database = PostgresJsDatabase<typeof schema>;

/** Only the delete is needed; keeping it structural lets tests inject one. */
type EnquiryStore = Pick<Database, 'delete'>;

/**
 * `DELETE /api/enquiries/:id` — remove one enquiry.
 *
 * A delete is the one action that cannot be reviewed afterwards, so it is
 * deliberate and blunt: the row and everything hanging off it (its notes, via
 * the foreign key's cascade) go together, and there is no soft-delete flag to
 * bring it back.
 */
export function createEnquiryDeleteHandler(options: { db?: EnquiryStore } = {}) {
  return async function DELETE(
    _request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> {
    const { id } = await context.params;

    if (!isEnquiryId(id)) {
      return NextResponse.json(
        { error: 'not_found', message: 'No enquiry has that id.' },
        { status: 404 },
      );
    }

    const db = options.db ?? getDb();

    try {
      const [deleted] = await db
        .delete(enquiries)
        .where(eq(enquiries.id, id))
        .returning({ id: enquiries.id });

      if (!deleted) {
        return NextResponse.json(
          { error: 'not_found', message: 'No enquiry has that id.' },
          { status: 404 },
        );
      }

      return NextResponse.json({ deleted: true, id: deleted.id });
    } catch (error) {
      logFailure('enquiries', 'delete', error);

      return NextResponse.json(
        { error: 'delete_failed', message: 'Could not delete the enquiry.' },
        { status: 500 },
      );
    }
  };
}

export type EnquiryDeleteHandler = ReturnType<typeof createEnquiryDeleteHandler>;

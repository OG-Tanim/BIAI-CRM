import { asc, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { enquiries, notes } from '@/lib/db/schema';
import type * as schema from '@/lib/db/schema';
import { toEnquiryDto, type EnquiryDto } from '@/lib/api/enquiry-dto';
import { toNoteDto, type NoteDto } from '@/lib/api/note-dto';

type Database = PostgresJsDatabase<typeof schema>;
type EnquiryDetailStore = Pick<Database, 'select'>;

/**
 * Everything one enquiry's detail view shows.
 *
 * The list holds the summary row; the detail view is the only place the raw
 * message, the reply columns and the note history are read back. Keeping the
 * load here means the page is a renderer and the route seam stays the only
 * database boundary the tests need.
 */
export type EnquiryDetail = {
  enquiry: EnquiryDto;
  notes: NoteDto[];
};

export async function fetchEnquiryDetail(
  db: EnquiryDetailStore,
  id: string,
): Promise<EnquiryDetail | null> {
  const [row] = await db
    .select()
    .from(enquiries)
    .where(eq(enquiries.id, id))
    .limit(1);

  if (!row) return null;

  const noteRows = await db
    .select()
    .from(notes)
    .where(eq(notes.enquiryId, id))
    .orderBy(asc(notes.createdAt));

  return {
    enquiry: toEnquiryDto(row),
    notes: noteRows.map(toNoteDto),
  };
}

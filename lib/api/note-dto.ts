import type { Note } from '@/lib/db/schema';

/**
 * The one note-to-JSON mapping.
 *
 * The update route returns the note it just wrote and the detail page lists the
 * history; both must agree on its shape.
 */
export type NoteDto = {
  id: string;
  enquiry_id: string;
  body: string;
  created_at: string;
};

export function toNoteDto(row: Note): NoteDto {
  return {
    id: row.id,
    enquiry_id: row.enquiryId,
    body: row.body,
    created_at: row.createdAt.toISOString(),
  };
}

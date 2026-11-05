import type { Enquiry } from '@/lib/db/schema';
import type {
  Channel,
  Interest,
  Kind,
  Status,
} from '@/lib/domain/enquiry';

/**
 * The one row-to-JSON mapping for an enquiry.
 *
 * The save, the list, the card move and the board all hand a database row to
 * the browser, and they must agree on its shape. Keeping one mapper means a new
 * column is added in one place, and no endpoint quietly re-casts the enums.
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
  created_at: string;
  last_contacted_at: string | null;
  updated_at: string;
};

/**
 * The saved enquiry in the same snake_case the extraction payload uses, so the
 * capture screen can move a proposal into the database without translating
 * every key by hand.
 */
export function toEnquiryDto(row: Enquiry): EnquiryDto {
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
    created_at: row.createdAt.toISOString(),
    last_contacted_at: row.lastContactedAt?.toISOString() ?? null,
    updated_at: row.updatedAt.toISOString(),
  };
}

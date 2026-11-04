import type { Interest, Kind, Status } from '@/lib/domain/enquiry';

/**
 * Presentation helpers with no server imports, so both the board (client) and
 * the list (server) can use the same wording.
 */

/**
 * The words the interface shows for the domain's enum values.
 *
 * These are copy, not decisions: they belong beside the formatters rather than
 * in `lib/domain/enquiry.ts`, whose job is the I/O-free decision seam.
 */
export const STATUS_LABELS: Record<Status, string> = {
  new: 'New',
  contacted: 'Contacted',
  interested: 'Interested',
  paid: 'Paid',
  lost: 'Lost',
};

export const KIND_LABELS: Record<Kind, string> = {
  sales_lead: 'Sales lead',
  job_seeker: 'Job seeker',
  support: 'Support',
  spam: 'Spam',
  unclear: 'Unclear',
};

export const INTEREST_LABELS: Record<Interest, string> = {
  bootcamp: 'Bootcamp',
  fellowship: 'Fellowship',
  corporate: 'Corporate training',
  unclear: 'Unclear',
};

/** A compact age phrase: "just now", "42m ago", "6h ago", "3d ago", "2mo ago". */
export function formatAge(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return 'unknown';
  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  return `${Math.floor(days / 30)}mo ago`;
}

const dateTimeFormat = new Intl.DateTimeFormat('en-GB', {
  // The team reads Dhaka time. Storage and the 48-hour arithmetic stay in UTC;
  // only the rendered instant moves.
  timeZone: 'Asia/Dhaka',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : dateTimeFormat.format(date);
}

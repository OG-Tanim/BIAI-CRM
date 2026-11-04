import type { Kind, Status } from '@/lib/domain/enquiry';

/**
 * I/O-free follow-up decisions.
 *
 * The queue's rule is one comparison and a few exclusions, but each part is
 * easy to get subtly wrong: the wrong clock, the wrong statuses, a non-lead
 * that slips through because the time test ran first. This module holds that
 * decision; the SQL in `lib/api/reminders.ts` expresses the same rule in the
 * database so the wrong rows never travel to the page.
 */

/** The queue is due after this much time without contact. */
export const FOLLOW_UP_HOURS = 48;
export const FOLLOW_UP_WINDOW_MS = FOLLOW_UP_HOURS * 60 * 60 * 1000;

/**
 * Only open sales work is chased. `interested` is deliberately absent: the
 * person has replied and the deal is moving, so the 48-hour nudge would be
 * wrong. `paid` and `lost` are finished.
 */
export const FOLLOW_UP_STATUSES = ['new', 'contacted'] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

/**
 * Non-sales enquiries are not deals. They are excluded by kind before the
 * clock is consulted, so a very old support thread can never become a
 * "follow-up" just because time passed.
 */
export const FOLLOW_UP_KIND = 'sales_lead' as const;

export type FollowUpCandidate = {
  status: Status;
  kind: Kind;
  createdAt: Date;
  lastContactedAt: Date | null;
};

export function isFollowUpStatus(status: Status): status is FollowUpStatus {
  return (FOLLOW_UP_STATUSES as readonly string[]).includes(status);
}

/**
 * The clock starts at the last time the person was reached, or at creation
 * when nobody has reached them yet. This is the same clock the board shows.
 */
export function followUpBasis(
  candidate: Pick<FollowUpCandidate, 'createdAt' | 'lastContactedAt'>,
): Date {
  return candidate.lastContactedAt ?? candidate.createdAt;
}

/**
 * The exact instant the rule compares against, in UTC.
 *
 * `now` is supplied rather than read so the boundary can be tested and so the
 * queue, the board and the summary all agree on what "48 hours" means. A local
 * time zone never enters the arithmetic: timestamps are absolute and the
 * subtraction is milliseconds.
 */
export function followUpCutoff(now: Date): Date {
  return new Date(now.getTime() - FOLLOW_UP_WINDOW_MS);
}

/** Whole seconds since the follow-up clock started, never negative. */
export function followUpAgeSeconds(
  candidate: Pick<FollowUpCandidate, 'createdAt' | 'lastContactedAt'>,
  now: Date,
): number {
  return Math.max(
    0,
    Math.floor((now.getTime() - followUpBasis(candidate).getTime()) / 1000),
  );
}

/**
 * Is this enquiry due for follow-up?
 *
 * The ticket fixes the boundary: 47h59m is absent and exactly 48h is present.
 * The comparison is therefore `>= 48 hours`, not `> 48 hours`. Only after the
 * kind and status exclusions have been applied does the clock decide.
 */
export function isDueForFollowUp(
  candidate: FollowUpCandidate,
  now: Date,
): boolean {
  if (candidate.kind !== FOLLOW_UP_KIND) return false;
  if (!isFollowUpStatus(candidate.status)) return false;

  return (
    followUpBasis(candidate).getTime() <= followUpCutoff(now).getTime()
  );
}

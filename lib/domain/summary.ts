import {
  KINDS,
  STATUSES,
  type Kind,
  type Status,
} from '@/lib/domain/enquiry';
import {
  placeholderTokens,
  replacePlaceholders,
} from '@/lib/domain/placeholders';

/**
 * I/O-free weekly-summary decisions.
 *
 * The numbers in a weekly summary must be the database's, never the model's.
 * The model writes prose; every count it may mention is a placeholder that
 * this module fills from the aggregate. A template carrying a digit, an
 * unknown token, or no count at all is rejected rather than displayed: a
 * plausible sentence with an invented number is worse than no sentence.
 */

export const SUMMARY_WINDOW_DAYS = 7;
export const SUMMARY_WINDOW_MS =
  SUMMARY_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * The aggregate the database computes. Every field here is a count or a
 * timestamp; nothing is a model guess.
 */
export type SummaryFacts = {
  window: {
    days: number;
    from: string;
    to: string;
  };
  /** Every enquiry created inside the window, all kinds. */
  received: number;
  received_by_kind: Record<Kind, number>;
  /** Sales leads whose last status move was inside the window. */
  moved: number;
  /** Sales leads New or Contacted with no contact for at least 48 hours. */
  stuck: number;
  /** The current shape of the sales pipeline. */
  leads_by_status: Record<Status, number>;
  generated_at: string;
};

/**
 * The only counts the narrator may name, each as `{{token}}`. Keeping the
 * allowlist here means the prompt, the renderer and the tests cannot drift.
 */
export const SUMMARY_COUNT_TOKENS = [
  'received',
  'sales_leads',
  'job_seekers',
  'support',
  'spam',
  'unclear',
  'moved',
  'stuck',
] as const;

export type SummaryCountToken = (typeof SUMMARY_COUNT_TOKENS)[number];

export class SummaryNarrationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid summary narration: ${issues.join('; ')}`);
    this.name = 'SummaryNarrationError';
    this.issues = issues;
  }
}

/** The seven-day window, computed from one supplied instant. */
export function summaryWindow(now: Date): { from: Date; to: Date } {
  return {
    from: new Date(now.getTime() - SUMMARY_WINDOW_MS),
    to: now,
  };
}

/** The token values the renderer may substitute. */
export function summaryCountValues(
  facts: SummaryFacts,
): Record<SummaryCountToken, number> {
  return {
    received: facts.received,
    sales_leads: facts.received_by_kind.sales_lead,
    job_seekers: facts.received_by_kind.job_seeker,
    support: facts.received_by_kind.support,
    spam: facts.received_by_kind.spam,
    unclear: facts.received_by_kind.unclear,
    moved: facts.moved,
    stuck: facts.stuck,
  };
}

export function emptyKindCounts(): Record<Kind, number> {
  return Object.fromEntries(KINDS.map((kind) => [kind, 0])) as Record<
    Kind,
    number
  >;
}

export function emptyStatusCounts(): Record<Status, number> {
  return Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<
    Status,
    number
  >;
}

const DIGITS = /[0-9\u09E6-\u09EF]/;

/**
 * Turn the model's prose into the narrative the page shows.
 *
 * The model is asked for placeholders, never digits. Requiring at least one
 * placeholder is what makes the result a summary of the counts rather than a
 * generic sentence; rejecting digits is what stops a remembered or invented
 * number reaching a reader. Bengali digits count as digits too: the narration
 * is English, so a numeral of any script is a number the model supplied.
 */
export function renderSummaryNarration(
  template: string,
  facts: SummaryFacts,
): string {
  const prose = template.trim();
  const issues: string[] = [];

  if (prose === '') {
    issues.push('narration: the model returned nothing.');
  }

  if (DIGITS.test(prose)) {
    issues.push(
      'narration: write counts as placeholders, never as digits or numbers of your own.',
    );
  }

  const values = summaryCountValues(facts);
  const tokens = placeholderTokens(prose);
  const unknown = tokens.filter(
    (token) => !(SUMMARY_COUNT_TOKENS as readonly string[]).includes(token),
  );

  if (unknown.length > 0) {
    issues.push(
      `narration: unknown placeholder ${unknown.map((token) => `{{${token}}}`).join(', ')}.`,
    );
  }

  if (tokens.length === 0) {
    issues.push('narration: mention at least one count placeholder.');
  }

  if (issues.length > 0) {
    throw new SummaryNarrationError(issues);
  }

  return replacePlaceholders(
    prose,
    (token) => String(values[token as SummaryCountToken]),
  );
}

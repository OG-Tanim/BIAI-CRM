import { z } from 'zod';
import {
  CHANNELS,
  INTERESTS,
  KINDS,
  REPLY_LANGUAGES,
  hasUnfilledPlaceholder,
  normalizePhone,
  type Channel,
  type Interest,
  type Kind,
  type ReplyLanguage,
} from '@/lib/domain/extraction';

/**
 * The capture and pipeline modules share one vocabulary. Re-exporting it here
 * keeps callers from importing two domain modules for one enquiry.
 */
export {
  CHANNELS,
  INTERESTS,
  KINDS,
  REPLY_LANGUAGES,
  type Channel,
  type Interest,
  type Kind,
  type ReplyLanguage,
};

/**
 * I/O-free capture decisions.
 *
 * The operator's reviewed form is trusted to be human, not trusted to be
 * right. This module decides what a save actually writes: status is always
 * `new`, the original message is never rewritten, and the reply template and
 * its filled counterpart stay two separate values.
 */

export const STATUSES = ['new', 'contacted', 'interested', 'paid', 'lost'] as const;
export type Status = (typeof STATUSES)[number];

/** The only status a save may produce. The operator changes it later, never the form. */
export const NEW_STATUS = 'new' satisfies Status;

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

/**
 * What a save writes. Deliberately not the database row type: the domain
 * module has no idea a database exists.
 */
export type NewEnquiryValues = {
  name: string;
  company: string | null;
  jobTitle: string | null;
  phone: string | null;
  channel: Channel;
  channelHandle: string | null;
  interest: Interest;
  kind: Kind;
  status: 'new';
  needsAttention: boolean;
  summary: string;
  rawMessage: string;
  suggestedReply: string;
  replyFilled: string | null;
  replyLanguage: ReplyLanguage;
};

export class EnquiryValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid enquiry: ${issues.join('; ')}`);
    this.name = 'EnquiryValidationError';
    this.issues = issues;
  }
}

/**
 * Copy is refused while a template token survives.
 *
 * The message names the tokens so the operator can see exactly what is missing
 * rather than being told "something went wrong".
 */
export class UnfilledPlaceholderError extends Error {
  readonly placeholders: string[];

  constructor(placeholders: string[]) {
    super(
      placeholders.length > 0
        ? `Reply still contains ${placeholders.map((token) => `{{${token}}}`).join(', ')}.`
        : 'Reply still contains an unfilled placeholder.',
    );
    this.name = 'UnfilledPlaceholderError';
    this.placeholders = placeholders;
  }
}

export class StatusChangeValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid status change: ${issues.join('; ')}`);
    this.name = 'StatusChangeValidationError';
    this.issues = issues;
  }
}

const nullableText = z.preprocess(
  (value: unknown) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null),
  z.string().nullable(),
);

const requiredText = z.preprocess(
  (value: unknown) => (typeof value === 'string' ? value.trim() : value),
  z.string().min(1),
);

const plainText = z.preprocess(
  (value: unknown) => (typeof value === 'string' ? value.trim() : ''),
  z.string(),
);

const phoneField = z.preprocess(
  (value: unknown) => normalizePhone(value),
  z.string().nullable(),
);

const attentionField = z.preprocess(
  (value: unknown) => value === true,
  z.boolean(),
);

/**
 * The reviewed form, in the same snake_case the extraction endpoint returns so
 * a proposal can be posted almost unchanged. Unknown keys — including a
 * `status` an over-eager client might send — are stripped.
 */
const reviewedEnquirySchema = z.object({
  name: requiredText,
  company: nullableText,
  job_title: nullableText,
  phone: phoneField,
  channel: z.enum(CHANNELS),
  channel_handle: nullableText,
  interest: z.enum(INTERESTS),
  kind: z.enum(KINDS),
  summary: plainText,
  suggested_reply: plainText,
  reply_filled: nullableText,
  reply_language: z.enum(REPLY_LANGUAGES),
  needs_attention: attentionField,
});

export type ReviewedEnquiry = z.infer<typeof reviewedEnquirySchema>;

const PLACEHOLDER_TOKEN = /\{\{([^{}]*)\}\}/g;

/**
 * The tokens still present in a reply, deduplicated. Used to tell the operator
 * what to fill; `hasUnfilledPlaceholder` remains the yes/no decision.
 */
export function pendingPlaceholders(reply: string | null | undefined): string[] {
  if (typeof reply !== 'string') return [];

  const tokens = new Set<string>();
  for (const match of reply.matchAll(PLACEHOLDER_TOKEN)) {
    tokens.add(match[1] ?? '');
  }
  return [...tokens];
}

/**
 * Choose the text a copy action may place on the clipboard.
 *
 * The filled version wins. The template is only a fallback for a reply that
 * never had placeholders — which `prepareEnquiry` normally stores as its own
 * filled version. A token left in the text is a warning, not a silent copy.
 */
export function replyToCopy(reply: {
  suggestedReply: string | null | undefined;
  replyFilled: string | null | undefined;
}): string {
  const template = typeof reply.suggestedReply === 'string' ? reply.suggestedReply : '';
  const filled =
    typeof reply.replyFilled === 'string' && reply.replyFilled.trim() !== ''
      ? reply.replyFilled
      : null;
  const text = filled ?? template;

  if (hasUnfilledPlaceholder(text)) {
    throw new UnfilledPlaceholderError(pendingPlaceholders(text));
  }

  return text;
}

/**
 * The filled reply that accompanies a template.
 *
 * An explicit filled version is kept as typed. With no filled version, a
 * template that has no placeholders is already complete and doubles as its own
 * filled version; a template with placeholders stays a template, and copy will
 * refuse it until the operator fills it.
 */
function resolveFilledReply(
  template: string,
  filled: string | null,
): string | null {
  if (filled !== null) return filled;
  if (template === '' || hasUnfilledPlaceholder(template)) return null;
  return template;
}

/**
 * Turn a reviewed form into the one row a save inserts.
 *
 * `rawMessage` is passed separately and is never trimmed, normalised or
 * re-derived: the original message is evidence, and the operator's edits to
 * the other fields must not touch it.
 */
export function prepareEnquiry(input: unknown, rawMessage: string): NewEnquiryValues {
  if (typeof rawMessage !== 'string' || rawMessage.trim() === '') {
    throw new EnquiryValidationError(['raw_message: An original message is required.']);
  }

  const parsed = reviewedEnquirySchema.safeParse(input);
  if (!parsed.success) {
    throw new EnquiryValidationError(
      parsed.error.issues.map((issue) => {
        const field = issue.path.join('.');
        return field ? `${field}: ${issue.message}` : issue.message;
      }),
    );
  }

  const data = parsed.data;

  return {
    name: data.name,
    company: data.company,
    jobTitle: data.job_title,
    phone: data.phone,
    channel: data.channel,
    channelHandle: data.channel_handle,
    interest: data.interest,
    kind: data.kind,
    // A save is not a status change. Whatever the client sent is already gone.
    status: NEW_STATUS,
    needsAttention: data.needs_attention,
    summary: data.summary,
    rawMessage,
    suggestedReply: data.suggested_reply,
    replyFilled: resolveFilledReply(data.suggested_reply, data.reply_filled),
    replyLanguage: data.reply_language,
  };
}

function isStatus(value: string): value is Status {
  return (STATUSES as readonly string[]).includes(value);
}

export type StatusChangeDecision = {
  status: Status;
  lastContactedAt: Date | null;
  note: string | null;
  /** True only when the status actually differs from the current one. */
  moved: boolean;
  /** False for a request that changes neither the status nor a non-blank note. */
  changed: boolean;
};

/**
 * Decide what a card move actually writes.
 *
 * A move is an explicit operator action and stamps `lastContactedAt` with the
 * supplied clock. A note appended without a move — including a request that
 * repeats the current status — changes no status and restamps no contact time:
 * writing down what was said is not the same as having just said it.
 *
 * There is deliberately no state machine. `paid` and `lost` are reachable from
 * anywhere, and this function is the only way a status moves at all.
 */
export function applyStatusChange(
  current: { status: Status; lastContactedAt: Date | null },
  request: { status?: unknown; note?: unknown },
  now: Date,
): StatusChangeDecision {
  const issues: string[] = [];
  let requestedStatus: Status | null = null;

  if (request.status !== undefined && request.status !== null) {
    if (
      typeof request.status !== 'string' ||
      !isStatus(request.status)
    ) {
      issues.push(`status: must be one of ${STATUSES.join(', ')}.`);
    } else {
      requestedStatus = request.status;
    }
  }

  let note: string | null = null;

  if (request.note !== undefined && request.note !== null) {
    if (typeof request.note !== 'string') {
      issues.push('note: must be text.');
    } else {
      const trimmed = request.note.trim();
      note = trimmed === '' ? null : trimmed;
    }
  }

  if (issues.length > 0) {
    throw new StatusChangeValidationError(issues);
  }

  const moved = requestedStatus !== null && requestedStatus !== current.status;
  const status = moved && requestedStatus !== null ? requestedStatus : current.status;

  return {
    status,
    lastContactedAt: moved ? now : current.lastContactedAt,
    note,
    moved,
    changed: moved || note !== null,
  };
}

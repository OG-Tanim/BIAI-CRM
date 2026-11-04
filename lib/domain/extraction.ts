import { z } from 'zod';
import {
  hasUnfilledPlaceholder,
  placeholderTokens,
} from '@/lib/domain/placeholders';

export { hasUnfilledPlaceholder };

/**
 * I/O-free extraction decisions.
 *
 * Everything in this module is a pure function over values: no database, no
 * network, no clock. The model is allowed to be wrong; these functions decide
 * what survives. Invalid nullable fields become `null`, a reply that breaks a
 * hard rule is voided, and the contract shape is the only shape that leaves.
 */

export const CHANNELS = ['whatsapp', 'facebook', 'website', 'email', 'phone'] as const;
export const INTERESTS = ['bootcamp', 'fellowship', 'corporate', 'unclear'] as const;
export const KINDS = ['sales_lead', 'job_seeker', 'support', 'spam', 'unclear'] as const;
export const REPLY_LANGUAGES = ['en', 'banglish', 'bn'] as const;

export type Channel = (typeof CHANNELS)[number];
export type Interest = (typeof INTERESTS)[number];
export type Kind = (typeof KINDS)[number];
export type ReplyLanguage = (typeof REPLY_LANGUAGES)[number];

/**
 * The nine tokens a reply may carry. Anything else is a model invention.
 */
export const ALLOWED_PLACEHOLDERS = [
  'price',
  'start_date',
  'schedule',
  'location',
  'instalments',
  'discount',
  'refund_policy',
  'certificate',
  'payment_method',
] as const;

export type AllowedPlaceholder = (typeof ALLOWED_PLACEHOLDERS)[number];

const allowedPlaceholderSet: ReadonlySet<string> = new Set(ALLOWED_PLACEHOLDERS);

/**
 * The contract shape the route returns. `suggested_reply` is nullable because
 * the placeholder and language guards void a bad reply rather than passing it
 * through. Every other key is always present, even when its value is null.
 *
 * There is deliberately no `status` key: status belongs to the operator.
 */
export type ExtractionResult = {
  name: string;
  company: string | null;
  job_title: string | null;
  phone: string | null;
  channel: Channel;
  channel_handle: string | null;
  interest: Interest;
  kind: Kind;
  summary: string;
  suggested_reply: string | null;
  reply_language: ReplyLanguage;
  needs_attention: boolean;
};

export class ExtractionValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid extraction: ${issues.join('; ')}`);
    this.name = 'ExtractionValidationError';
    this.issues = issues;
  }
}

export class PlaceholderNotAllowedError extends Error {
  readonly token: string;

  constructor(token: string) {
    super(`Placeholder {{${token}}} is not allowlisted.`);
    this.name = 'PlaceholderNotAllowedError';
    this.token = token;
  }
}

const BENGALI_SCRIPT = /[\u0980-\u09FF]/;
const BENGALI_DIGITS = '০১২৩৪৫৬৭৮৯';

/**
 * The one deterministic language fact: does this text use Bengali script?
 *
 * Romanised Bangla (Banglish) is deliberately not detected here. Telling it
 * apart from English is a judgement call, and a wrong label is worse than no
 * label.
 */
export function hasBengaliScript(value: string | null | undefined): boolean {
  return typeof value === 'string' && BENGALI_SCRIPT.test(value);
}

function toAsciiDigits(value: string): string {
  return value.replace(/[০-৯]/g, (digit) => String(BENGALI_DIGITS.indexOf(digit)));
}

/**
 * A phone number is either clearly a number or it is not there.
 *
 * Separators are removed and Bengali digits are transliterated, but the result
 * must still look like a dialable phone number (7–15 digits). Anything else is
 * null, never a guess.
 */
export function normalizePhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = toAsciiDigits(value.trim());
  if (!trimmed) return null;

  const compact = trimmed.replace(/[\s().\-–—]/g, '');
  if (!/^\+?\d{7,15}$/.test(compact)) return null;

  return compact;
}

/**
 * Throw when a reply carries a `{{token}}` outside the allowlist.
 *
 * Used directly by callers that want to reject a reply, and wrapped by
 * `validateExtraction`, which voids the reply instead of failing the request.
 */
export function assertPlaceholdersAllowed(reply: string): void {
  for (const token of placeholderTokens(reply)) {
    if (!allowedPlaceholderSet.has(token)) {
      throw new PlaceholderNotAllowedError(token);
    }
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

const summaryText = z.preprocess(
  (value: unknown) => (typeof value === 'string' ? value.trim() : value),
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
 * The model's answer, before the guards. Unknown keys are stripped by Zod, so
 * a `status` the model invents never reaches the response. Fields that are
 * nullable in the contract degrade to null; fields that cannot be null make
 * the whole extraction invalid.
 */
const modelExtractionSchema = z.object({
  name: requiredText,
  company: nullableText,
  job_title: nullableText,
  phone: phoneField,
  channel: z.enum(CHANNELS),
  channel_handle: nullableText,
  interest: z.enum(INTERESTS),
  kind: z.enum(KINDS),
  summary: summaryText,
  suggested_reply: nullableText,
  reply_language: z.enum(REPLY_LANGUAGES),
  needs_attention: attentionField,
});

/**
 * Validate one model answer against the extraction contract.
 *
 * Guard order matters:
 * 1. Shape validation (invalid nullable values become null, no status escapes).
 * 2. A reply with a non-allowlisted placeholder is voided entirely.
 * 3. A Bengali-script message must be answered in Bengali script; otherwise the
 *    reply is voided rather than sending English to a Bangla customer.
 */
export function validateExtraction(raw: unknown, rawMessage: string): ExtractionResult {
  const parsed = modelExtractionSchema.safeParse(raw);

  if (!parsed.success) {
    throw new ExtractionValidationError(
      parsed.error.issues.map((issue) => {
        const field = issue.path.join('.');
        return field ? `${field}: ${issue.message}` : issue.message;
      }),
    );
  }

  const data = parsed.data;
  let suggestedReply = data.suggested_reply;

  if (suggestedReply !== null) {
    try {
      assertPlaceholdersAllowed(suggestedReply);
    } catch (error) {
      if (!(error instanceof PlaceholderNotAllowedError)) throw error;
      suggestedReply = null;
    }
  }

  if (hasBengaliScript(rawMessage)) {
    const replyIsBengali =
      suggestedReply !== null && hasBengaliScript(suggestedReply);

    if (data.reply_language !== 'bn' || !replyIsBengali) {
      suggestedReply = null;
    }
  }

  return {
    name: data.name,
    company: data.company,
    job_title: data.job_title,
    phone: data.phone,
    channel: data.channel,
    channel_handle: data.channel_handle,
    interest: data.interest,
    kind: data.kind,
    summary: data.summary,
    suggested_reply: suggestedReply,
    reply_language: data.reply_language,
    needs_attention: data.needs_attention,
  };
}

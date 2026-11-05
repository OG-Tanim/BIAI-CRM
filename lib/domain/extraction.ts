import { z } from 'zod';
import {
  hasUnfilledPlaceholder,
  placeholderTokens,
} from '@/lib/domain/placeholders';

export { hasUnfilledPlaceholder };

/**
 * I/O-free extraction and reply-contract decisions.
 *
 * Everything in this module is a pure function over values: no database, no
 * network, no clock. Extraction answers are shape-checked; invalid nullable
 * fields become `null` and the contract shape is the only shape that leaves.
 * Reply drafts are returned as the model wrote them. The placeholder allowlist
 * is enforced only when an operator edits a reply.
 */

export const CHANNELS = ['whatsapp', 'facebook', 'website', 'phone'] as const;
export const INTERESTS = ['bootcamp', 'fellowship', 'corporate', 'unclear'] as const;
export const KINDS = ['sales_lead', 'job_seeker', 'support', 'spam', 'unclear'] as const;

export type Channel = (typeof CHANNELS)[number];
export type Interest = (typeof INTERESTS)[number];
export type Kind = (typeof KINDS)[number];

/**
 * The nine tokens the reply prompt asks the model to use. The manual reply
 * editor rejects anything else; generated replies are not checked.
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
 * The contract shape the route returns. Every key is always present, even when
 * its value is null. Read message extracts identity and classification only;
 * the reply is generated separately by `/api/reply`.
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
  needs_attention: boolean;
};

/**
 * The reply-only generation contract. The capture screen's Generate reply
 * button uses this when the operator wants a reply without a full extraction.
 * The model's text is returned as-is; there is no server-side reply guard.
 */
export type ReplyDraft = {
  reply: string | null;
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

const BENGALI_DIGITS = '০১২৩৪৫৬৭৮৯';

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
 * Used by the manual reply editor, where an operator-edited template must stay
 * inside the nine-token contract. Generated replies are not checked here.
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
 * a `status` or a volunteered reply the model invents never reaches the
 * response. Fields that are nullable in the contract degrade to null; fields
 * that cannot be null make the whole extraction invalid.
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
  needs_attention: attentionField,
});

function validationIssues(error: z.ZodError): ExtractionValidationError {
  return new ExtractionValidationError(
    error.issues.map((issue) => {
      const field = issue.path.join('.');
      return field ? `${field}: ${issue.message}` : issue.message;
    }),
  );
}

/**
 * Validate one model answer against the extraction contract.
 *
 * Shape validation is the whole job here: invalid nullable values become null,
 * a status never escapes, and any reply the model volunteers is stripped. Reply
 * text is generated by the separate `/api/reply` flow.
 */
export function validateExtraction(raw: unknown): ExtractionResult {
  const parsed = modelExtractionSchema.safeParse(raw);

  if (!parsed.success) {
    throw validationIssues(parsed.error);
  }

  const data = parsed.data;

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
    needs_attention: data.needs_attention,
  };
}

/**
 * The reply-only model answer. Nothing but the text is accepted, so a reply
 * request cannot quietly create or overwrite a status, name or phone number.
 * The reply language is chosen inside the prompt and is never stored or
 * returned.
 */
const modelReplySchema = z.object({
  reply: nullableText,
});

/**
 * A weak model occasionally answers with the extraction field name
 * (`suggested_reply`) even when the prompt asks for `reply`. Reading that alias
 * costs nothing and prevents a non-null answer from being reported as "no
 * reply"; the contract still strips everything else.
 */
function normalizeReplyAnswer(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return raw;
  }

  const record = raw as Record<string, unknown>;

  if (!('reply' in record) && 'suggested_reply' in record) {
    return { reply: record.suggested_reply };
  }

  return raw;
}

export function validateReplyDraft(raw: unknown): ReplyDraft {
  const parsed = modelReplySchema.safeParse(normalizeReplyAnswer(raw));

  if (!parsed.success) {
    throw validationIssues(parsed.error);
  }

  return parsed.data;
}

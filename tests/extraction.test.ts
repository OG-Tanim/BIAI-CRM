import { describe, expect, it } from 'vitest';
import {
  ALLOWED_PLACEHOLDERS,
  ExtractionValidationError,
  PlaceholderNotAllowedError,
  assertPlaceholdersAllowed,
  hasUnfilledPlaceholder,
  normalizePhone,
  validateExtraction,
  validateReplyDraft,
} from '@/lib/domain/extraction';

/**
 * Seam 1: the pure domain module. No database, no network, no route.
 *
 * Read message extracts fields only, so `validateExtraction` is tested for the
 * extraction contract. Reply text belongs to the separate `validateReplyDraft`
 * tests below, which return the model's answer unchanged.
 */

/**
 * A valid extraction answer. The reply keys are deliberately present: Read
 * message must strip anything reply-shaped a model volunteers.
 */
function modelAnswer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Nowshin',
    company: null,
    job_title: null,
    phone: null,
    channel: 'facebook',
    channel_handle: null,
    interest: 'bootcamp',
    kind: 'sales_lead',
    summary: 'Asks whether the course certificate is government approved.',
    suggested_reply:
      'Hi Nowshin! Our certificate is {{certificate}}. Let us know if you have any other questions.',
    needs_attention: false,
    ...overrides,
  };
}

const CONTRACT_KEYS = [
  'channel',
  'channel_handle',
  'company',
  'interest',
  'job_title',
  'kind',
  'name',
  'needs_attention',
  'phone',
  'summary',
];

describe('validateExtraction', () => {
  it('returns every contract field and never a status or a reply', () => {
    const result = validateExtraction(modelAnswer({ status: 'paid' }));

    expect(Object.keys(result).sort()).toEqual(CONTRACT_KEYS);
    expect(result).not.toHaveProperty('status');
    expect(result).not.toHaveProperty('suggested_reply');
  });

  it('returns a complete proposal', () => {
    const result = validateExtraction(modelAnswer());

    expect(result).toMatchObject({
      name: 'Nowshin',
      channel: 'facebook',
      interest: 'bootcamp',
      kind: 'sales_lead',
      needs_attention: false,
    });
  });

  it('keeps a sender role and company separate, with a clean name', () => {
    const result = validateExtraction(modelAnswer({
      name: 'Mahmud Hasan',
      job_title: 'Managing Director',
      company: 'Gazipur textile company',
      channel: 'website',
      interest: 'corporate',
    }));

    expect(result.name).toBe('Mahmud Hasan');
    expect(result.job_title).toBe('Managing Director');
    expect(result.company).toBe('Gazipur textile company');
  });

  it('keeps a null phone null instead of guessing', () => {
    const result = validateExtraction(modelAnswer({ phone: null }));
    expect(result.phone).toBeNull();
  });

  it('coerces an invalid phone to null', () => {
    for (const phone of ['call me maybe', '12345', 'not-a-number', 1700000000]) {
      expect(validateExtraction(modelAnswer({ phone })).phone).toBeNull();
    }
  });

  it('normalises a phone that is clearly a number', () => {
    const result = validateExtraction(modelAnswer({ phone: '01712-345 678' }));
    expect(result.phone).toBe('01712345678');
  });

  it('turns blank nullable text into null', () => {
    const result = validateExtraction(
      modelAnswer({ company: '   ', job_title: '', channel_handle: '  ' }),
    );

    expect(result.company).toBeNull();
    expect(result.job_title).toBeNull();
    expect(result.channel_handle).toBeNull();
  });

  it('treats an absent needs_attention as false', () => {
    expect(
      validateExtraction(modelAnswer({ needs_attention: 'yes' }))
        .needs_attention,
    ).toBe(false);
  });

  it('rejects an answer missing a required field', () => {
    expect(() =>
      validateExtraction(modelAnswer({ name: '   ' })),
    ).toThrow(ExtractionValidationError);
  });

  it('rejects a value outside a required enum', () => {
    expect(() =>
      validateExtraction(modelAnswer({ channel: 'carrier_pigeon' })),
    ).toThrow(ExtractionValidationError);
  });

  it('rejects a non-object answer', () => {
    expect(() => validateExtraction('not an object')).toThrow(
      ExtractionValidationError,
    );
  });
});

describe('validateReplyDraft', () => {
  it('returns only the reply', () => {
    const result = validateReplyDraft({
      reply: 'The fee is {{price}}.',
      reply_language: 'en',
      status: 'paid',
      phone: '01711000001',
    });

    expect(result).toEqual({ reply: 'The fee is {{price}}.' });
  });

  it('accepts a null reply for a message that needs none', () => {
    expect(validateReplyDraft({ reply: null })).toEqual({ reply: null });
  });

  it('turns a blank reply into null', () => {
    expect(validateReplyDraft({ reply: '   ' })).toEqual({ reply: null });
  });

  it('passes a reply with any placeholder through unchanged', () => {
    const reply = 'The next cohort starts {{cohort_two}}.';
    const result = validateReplyDraft({ reply });

    expect(result.reply).toBe(reply);
  });

  it('keeps the model reply as written', () => {
    const reply = 'ধন্যবাদ! আমরা শীঘ্রই যোগাযোগ করব।';
    const result = validateReplyDraft({ reply });

    expect(result.reply).toBe(reply);
  });

  it('accepts suggested_reply as the field name a confused model may emit', () => {
    const result = validateReplyDraft({
      suggested_reply: 'The fee is {{price}}.',
    });

    expect(result.reply).toBe('The fee is {{price}}.');
  });

  it('rejects a non-object answer', () => {
    expect(() => validateReplyDraft('not an object')).toThrow(
      ExtractionValidationError,
    );
  });
});

describe('assertPlaceholdersAllowed', () => {
  it('accepts all nine allowlisted tokens, including a repeat', () => {
    const reply = ALLOWED_PLACEHOLDERS.map((token) => `{{${token}}}`).join(' ');
    expect(() => assertPlaceholdersAllowed(`${reply} {{price}}`)).not.toThrow();
  });

  it('rejects a token outside the allowlist', () => {
    expect(() => assertPlaceholdersAllowed('{{cohort_two}}')).toThrow(
      PlaceholderNotAllowedError,
    );
  });

  it('rejects a token whose spacing does not match', () => {
    expect(() => assertPlaceholdersAllowed('{{ price }}')).toThrow(
      PlaceholderNotAllowedError,
    );
  });

  it('accepts a reply with no placeholders', () => {
    expect(() => assertPlaceholdersAllowed('Thanks for reaching out.')).not.toThrow();
  });
});

describe('hasUnfilledPlaceholder', () => {
  it('is true while a template token remains', () => {
    expect(hasUnfilledPlaceholder('the fee is {{price}}')).toBe(true);
  });

  it('is false once the token has been replaced', () => {
    expect(hasUnfilledPlaceholder('the fee is 12,000 taka')).toBe(false);
  });

  it('is false for an absent reply', () => {
    expect(hasUnfilledPlaceholder(null)).toBe(false);
    expect(hasUnfilledPlaceholder(undefined)).toBe(false);
    expect(hasUnfilledPlaceholder('')).toBe(false);
  });
});

describe('normalizePhone', () => {
  it('removes formatting and transliterates Bengali digits', () => {
    expect(normalizePhone('+880 1712-345678')).toBe('+8801712345678');
    expect(normalizePhone('০১৭১১০০০০০১')).toBe('01711000001');
  });

  it('returns null when no dialable number is present', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });
});

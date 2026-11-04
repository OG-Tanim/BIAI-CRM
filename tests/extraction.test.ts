import { describe, expect, it } from 'vitest';
import {
  ALLOWED_PLACEHOLDERS,
  ExtractionValidationError,
  PlaceholderNotAllowedError,
  assertPlaceholdersAllowed,
  hasBengaliScript,
  hasUnfilledPlaceholder,
  normalizePhone,
  validateExtraction,
} from '@/lib/domain/extraction';

/**
 * Seam 1: the pure domain module. No database, no network, no route.
 *
 * The messages below are the real samples, because the guard is only useful if
 * it separates the rows it must separate.
 */
const BANGLA_MESSAGES = [
  // #2
  'ফেলোশিপ প্রোগ্রামে ভর্তি হতে চাই। কবে শুরু হবে?',
  // #7
  'পেমেন্ট করেছি কিন্তু কোনো কনফার্মেশন পাইনি। আমার নাম ফারজানা রহমান। ২৫ তারিখে বিকাশে দিয়েছি।',
  // #13
  'আমি ক্লাস ৯-এ পড়ি। আমি কি ফ্রি মাস্টারক্লাসে জয়েন করতে পারব?',
  // #18
  'আমার কোম্পানির ১৫ জন কর্মীর জন্য কি গ্রুপ ডিসকাউন্ট আছে?',
];

const BANGLISH_MESSAGES = [
  // #1
  'Assalamualaikum, apnader 3 day bootcamp er price koto? Payment kibhabe korbo?',
  // #4
  'Vai class gula live hoy naki recorded? Recording pawa jay?',
  // #6
  'Ei course korle job pabo?',
  // #9
  'Offline class kothay hobe? Mirpur e?',
  // #12
  'Bootcamp er price ta bolen please',
  // #15
  'Add-on ta ki? Lifetime access mane ki?',
  // #17
  'Apnader course certificate ta ki govt approved?',
];

const ENGLISH_MESSAGES = [
  // #3
  'I run a 40-person textile company in Gazipur. We want AI training for our team. Can someone call me this week?',
  // #5
  'Called to ask about student discount. Said she will call again tomorrow after 5 PM.',
  // #8
  'Do you offer refunds if I cannot attend after paying?',
  // #10
  "Hi, I'm from a bank in Motijheel. Need a quote for training 120 employees. Online or onsite both fine.",
  // #11
  'Earn 5000 USD every day with our crypto signals! Click bit.ly/xxxx now!!!',
  // #14
  'Is the fellowship suitable for a non-technical marketing manager? I have 8 years of experience but no coding.',
  // #16
  'Caller wants to cancel his enrolment and get his money back. Very upset. Said he will post about it on Facebook if not solved today.',
  // #19
  'Can I pay in two instalments for the fellowship?',
  // #20
  'Looking for a job as an AI intern. Where do I apply?',
];

const BANGLISH_17 = BANGLISH_MESSAGES[6]!;
const BANGLA_2 = BANGLA_MESSAGES[0]!;

/** A valid, complete model answer. Overrides model one wrong field at a time. */
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
    reply_language: 'banglish',
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
  'reply_language',
  'suggested_reply',
  'summary',
];

describe('hasBengaliScript', () => {
  it.each(BANGLA_MESSAGES)('is true for a Bangla-script sample: %s', (message) => {
    expect(hasBengaliScript(message)).toBe(true);
  });

  it.each(BANGLISH_MESSAGES)('is false for a Banglish sample: %s', (message) => {
    expect(hasBengaliScript(message)).toBe(false);
  });

  it.each(ENGLISH_MESSAGES)('is false for an English sample: %s', (message) => {
    expect(hasBengaliScript(message)).toBe(false);
  });

  it('is false for absent text', () => {
    expect(hasBengaliScript(null)).toBe(false);
    expect(hasBengaliScript(undefined)).toBe(false);
    expect(hasBengaliScript('')).toBe(false);
  });
});

describe('validateExtraction', () => {
  it('returns every contract field and never a status', () => {
    const result = validateExtraction(
      modelAnswer({ status: 'paid' }),
      BANGLISH_17,
    );

    expect(Object.keys(result).sort()).toEqual(CONTRACT_KEYS);
    expect(result).not.toHaveProperty('status');
  });

  it('returns a complete Banglish proposal', () => {
    const result = validateExtraction(modelAnswer(), BANGLISH_17);

    expect(result).toMatchObject({
      name: 'Nowshin',
      channel: 'facebook',
      interest: 'bootcamp',
      kind: 'sales_lead',
      reply_language: 'banglish',
      needs_attention: false,
    });
    expect(result.suggested_reply).toContain('{{certificate}}');
    expect(result.suggested_reply).not.toBeNull();
  });

  it('keeps a sender role and company separate, with a clean name', () => {
    const result = validateExtraction(
      modelAnswer({
        name: 'Mahmud Hasan',
        job_title: 'Managing Director',
        company: 'Gazipur textile company',
        channel: 'website',
        interest: 'corporate',
        suggested_reply:
          'Hello Mahmud, thank you for reaching out. Could you share a good time for a call this week?',
        reply_language: 'en',
      }),
      'I run a 40-person textile company in Gazipur. We want AI training for our team. Can someone call me this week?',
    );

    expect(result.name).toBe('Mahmud Hasan');
    expect(result.job_title).toBe('Managing Director');
    expect(result.company).toBe('Gazipur textile company');
  });

  it('keeps a null phone null instead of guessing', () => {
    const result = validateExtraction(modelAnswer({ phone: null }), BANGLISH_17);
    expect(result.phone).toBeNull();
  });

  it('coerces an invalid phone to null', () => {
    for (const phone of ['call me maybe', '12345', 'not-a-number', 1700000000]) {
      expect(validateExtraction(modelAnswer({ phone }), BANGLISH_17).phone).toBeNull();
    }
  });

  it('normalises a phone that is clearly a number', () => {
    const result = validateExtraction(
      modelAnswer({ phone: '01712-345 678' }),
      BANGLISH_17,
    );
    expect(result.phone).toBe('01712345678');
  });

  it('turns blank nullable text into null', () => {
    const result = validateExtraction(
      modelAnswer({ company: '   ', job_title: '', channel_handle: '  ' }),
      BANGLISH_17,
    );

    expect(result.company).toBeNull();
    expect(result.job_title).toBeNull();
    expect(result.channel_handle).toBeNull();
  });

  it('treats an absent needs_attention as false', () => {
    expect(
      validateExtraction(modelAnswer({ needs_attention: 'yes' }), BANGLISH_17)
        .needs_attention,
    ).toBe(false);
  });

  describe('Bengali-script guard', () => {
    it('voids an English reply labelled en', () => {
      const result = validateExtraction(
        modelAnswer({
          reply_language: 'en',
          suggested_reply: 'Thanks for your message. We will reply soon.',
        }),
        BANGLA_2,
      );

      expect(result.suggested_reply).toBeNull();
    });

    it('voids a Bangla-labelled reply that carries no Bengali text', () => {
      const result = validateExtraction(
        modelAnswer({
          reply_language: 'bn',
          suggested_reply: 'Thanks for your message. We will reply soon.',
        }),
        BANGLA_2,
      );

      expect(result.suggested_reply).toBeNull();
    });

    it('voids a Bengali reply that is labelled banglish', () => {
      const result = validateExtraction(
        modelAnswer({
          reply_language: 'banglish',
          suggested_reply: 'ধন্যবাদ! আমরা শীঘ্রই যোগাযোগ করব।',
        }),
        BANGLA_2,
      );

      expect(result.suggested_reply).toBeNull();
    });

    it('keeps a Bengali reply labelled bn', () => {
      const reply = 'আসসালামু আলাইকুম, তাহমিনা! ফেলোশিপ শুরু হবে {{start_date}}-এ।';
      const result = validateExtraction(
        modelAnswer({ reply_language: 'bn', suggested_reply: reply }),
        BANGLA_2,
      );

      expect(result.reply_language).toBe('bn');
      expect(result.suggested_reply).toBe(reply);
    });

    it('leaves English and Banglish replies alone', () => {
      const result = validateExtraction(
        modelAnswer({
          reply_language: 'en',
          suggested_reply: 'Hello, thanks for reaching out. We will reply soon.',
        }),
        BANGLISH_17,
      );

      expect(result.suggested_reply).not.toBeNull();
    });
  });

  describe('placeholder guard', () => {
    it('voids a reply carrying a non-allowlisted token', () => {
      const result = validateExtraction(
        modelAnswer({
          suggested_reply: 'The next cohort starts {{cohort_two}}.',
        }),
        BANGLISH_17,
      );

      expect(result.suggested_reply).toBeNull();
    });

    it('keeps a reply that uses only allowlisted tokens', () => {
      const reply =
        'Fee {{price}}, starts {{start_date}}, classes {{schedule}} at {{location}}, ' +
        'instalments {{instalments}}, discount {{discount}}, refunds {{refund_policy}}, ' +
        'certificate {{certificate}}, pay by {{payment_method}}, and again {{price}}.';
      const result = validateExtraction(
        modelAnswer({ suggested_reply: reply }),
        BANGLISH_17,
      );

      expect(result.suggested_reply).toBe(reply);
    });
  });

  it('rejects an answer missing a required field', () => {
    expect(() =>
      validateExtraction(modelAnswer({ name: '   ' }), BANGLISH_17),
    ).toThrow(ExtractionValidationError);
  });

  it('rejects a value outside a required enum', () => {
    expect(() =>
      validateExtraction(modelAnswer({ channel: 'carrier_pigeon' }), BANGLISH_17),
    ).toThrow(ExtractionValidationError);
    expect(() =>
      validateExtraction(modelAnswer({ reply_language: 'fr' }), BANGLISH_17),
    ).toThrow(ExtractionValidationError);
  });

  it('rejects a non-object answer', () => {
    expect(() => validateExtraction('not an object', BANGLISH_17)).toThrow(
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

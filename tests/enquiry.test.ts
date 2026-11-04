import { describe, expect, it } from 'vitest';
import {
  EnquiryValidationError,
  StatusChangeValidationError,
  UnfilledPlaceholderError,
  applyStatusChange,
  pendingPlaceholders,
  prepareEnquiry,
  replyToCopy,
} from '@/lib/domain/enquiry';

/**
 * Seam 1: the pure domain module. No database, no route, no clipboard.
 *
 * These are the decisions a save must not get wrong: status is not the form's
 * business, the original message is evidence, and a template is never silently
 * turned into a filled reply.
 */

function reviewed(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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
      'Hi Nowshin! Our certificate is {{certificate}}. Let us know if you have questions.',
    reply_filled: null,
    reply_language: 'banglish',
    needs_attention: false,
    ...overrides,
  };
}

const RAW_MESSAGE = 'Apnader course certificate ta ki govt approved?';

describe('prepareEnquiry', () => {
  it('always produces a New enquiry', () => {
    const values = prepareEnquiry(reviewed({ status: 'paid' }), RAW_MESSAGE);

    expect(values.status).toBe('new');
  });

  it('keeps the original message byte for byte', () => {
    const message = '  Line one.\n\nLine two — with “quotes”.\t ';
    const values = prepareEnquiry(reviewed(), message);

    expect(values.rawMessage).toBe(message);
  });

  it('keeps the reply placeholders in the template and stores the filled version separately', () => {
    const values = prepareEnquiry(
      reviewed({
        suggested_reply: 'The fee is {{price}} and classes start {{start_date}}.',
        reply_filled: 'The fee is 5,000 taka and classes start 1 December.',
      }),
      RAW_MESSAGE,
    );

    expect(values.suggestedReply).toBe(
      'The fee is {{price}} and classes start {{start_date}}.',
    );
    expect(values.replyFilled).toBe(
      'The fee is 5,000 taka and classes start 1 December.',
    );
  });

  it('leaves a template with placeholders unfilled when no filled version is supplied', () => {
    const values = prepareEnquiry(
      reviewed({ suggested_reply: 'The fee is {{price}}.' }),
      RAW_MESSAGE,
    );

    expect(values.suggestedReply).toBe('The fee is {{price}}.');
    expect(values.replyFilled).toBeNull();
  });

  it('treats a reply with no placeholders as its own filled version', () => {
    const values = prepareEnquiry(
      reviewed({ suggested_reply: 'Thanks for reaching out. We will call you today.' }),
      RAW_MESSAGE,
    );

    expect(values.suggestedReply).toBe('Thanks for reaching out. We will call you today.');
    expect(values.replyFilled).toBe('Thanks for reaching out. We will call you today.');
  });

  it('stores a filled version exactly as typed, even if a placeholder survived', () => {
    const values = prepareEnquiry(
      reviewed({ reply_filled: 'The fee is {{price}}.' }),
      RAW_MESSAGE,
    );

    expect(values.suggestedReply).toContain('{{certificate}}');
    expect(values.replyFilled).toBe('The fee is {{price}}.');
  });

  it('normalises a phone number the operator typed with formatting', () => {
    const values = prepareEnquiry(
      reviewed({ phone: '01712-345 678' }),
      RAW_MESSAGE,
    );

    expect(values.phone).toBe('01712345678');
  });

  it('turns a phone that is not a number into null', () => {
    const values = prepareEnquiry(reviewed({ phone: 'call me maybe' }), RAW_MESSAGE);

    expect(values.phone).toBeNull();
  });

  it('turns blank nullable fields into null and missing text into empty strings', () => {
    const values = prepareEnquiry(
      reviewed({
        company: '  ',
        job_title: '',
        channel_handle: null,
        summary: undefined,
        suggested_reply: undefined,
      }),
      RAW_MESSAGE,
    );

    expect(values.company).toBeNull();
    expect(values.jobTitle).toBeNull();
    expect(values.channelHandle).toBeNull();
    expect(values.summary).toBe('');
    expect(values.suggestedReply).toBe('');
    expect(values.replyFilled).toBeNull();
  });

  it('rejects an empty name', () => {
    expect(() => prepareEnquiry(reviewed({ name: '   ' }), RAW_MESSAGE)).toThrow(
      EnquiryValidationError,
    );
  });

  it('rejects a channel, interest or kind outside the contract', () => {
    for (const overrides of [
      { channel: 'carrier_pigeon' },
      { interest: 'free_money' },
      { kind: 'friend' },
      { reply_language: 'fr' },
    ]) {
      expect(() => prepareEnquiry(reviewed(overrides), RAW_MESSAGE)).toThrow(
        EnquiryValidationError,
      );
    }
  });

  it('rejects a save with no original message', () => {
    expect(() => prepareEnquiry(reviewed(), '   ')).toThrow(EnquiryValidationError);
    expect(() => prepareEnquiry(reviewed(), undefined as unknown as string)).toThrow(
      EnquiryValidationError,
    );
  });
});

describe('replyToCopy', () => {
  it('copies the filled version rather than the template', () => {
    expect(
      replyToCopy({
        suggestedReply: 'The fee is {{price}}.',
        replyFilled: 'The fee is 5,000 taka.',
      }),
    ).toBe('The fee is 5,000 taka.');
  });

  it('refuses to copy a template whose placeholder is still there', () => {
    expect(() =>
      replyToCopy({
        suggestedReply: 'The fee is {{price}}.',
        replyFilled: null,
      }),
    ).toThrow(UnfilledPlaceholderError);
  });

  it('refuses to copy a filled version that still carries a placeholder', () => {
    expect(() =>
      replyToCopy({
        suggestedReply: 'The fee is {{price}}.',
        replyFilled: 'The fee is {{price}}.',
      }),
    ).toThrow(UnfilledPlaceholderError);
  });

  it('names the placeholders that still need filling', () => {
    try {
      replyToCopy({
        suggestedReply:
          'The fee is {{price}}, starts {{start_date}}, and {{price}} again.',
        replyFilled: null,
      });
      throw new Error('expected copy to be refused');
    } catch (error) {
      expect(error).toBeInstanceOf(UnfilledPlaceholderError);
      expect((error as UnfilledPlaceholderError).placeholders).toEqual([
        'price',
        'start_date',
      ]);
    }
  });

  it('copies a reply that never had placeholders', () => {
    expect(
      replyToCopy({
        suggestedReply: 'Thanks for reaching out.',
        replyFilled: null,
      }),
    ).toBe('Thanks for reaching out.');
  });

  it('prefers an explicit filled version even when it is empty of placeholders', () => {
    expect(
      replyToCopy({
        suggestedReply: 'The fee is {{price}}.',
        replyFilled: 'Already handled by phone.',
      }),
    ).toBe('Already handled by phone.');
  });

  it('returns an empty string when there is no reply at all', () => {
    expect(replyToCopy({ suggestedReply: '', replyFilled: null })).toBe('');
  });
});

describe('pendingPlaceholders', () => {
  it('lists each token once', () => {
    expect(
      pendingPlaceholders('{{price}} now, {{price}} later, {{start_date}} soon'),
    ).toEqual(['price', 'start_date']);
  });

  it('returns nothing for a filled reply or an absent one', () => {
    expect(pendingPlaceholders('The fee is 5,000 taka.')).toEqual([]);
    expect(pendingPlaceholders(null)).toEqual([]);
    expect(pendingPlaceholders(undefined)).toEqual([]);
  });
});

describe('applyStatusChange', () => {
  const now = new Date('2026-11-04T12:00:00.000Z');
  const earlier = new Date('2026-11-01T09:30:00.000Z');

  it('stamps contact time when a card moves out of New', () => {
    const decision = applyStatusChange(
      { status: 'new', lastContactedAt: null },
      { status: 'contacted', note: 'Called and introduced ourselves.' },
      now,
    );

    expect(decision.status).toBe('contacted');
    expect(decision.lastContactedAt).toEqual(now);
    expect(decision.note).toBe('Called and introduced ourselves.');
    expect(decision.moved).toBe(true);
    expect(decision.changed).toBe(true);
  });

  it('stamps contact time on a later move too', () => {
    const decision = applyStatusChange(
      { status: 'contacted', lastContactedAt: earlier },
      { status: 'interested' },
      now,
    );

    expect(decision.status).toBe('interested');
    expect(decision.lastContactedAt).toEqual(now);
    expect(decision.note).toBeNull();
  });

  it('a note with no status change moves nothing and restamps nothing', () => {
    const decision = applyStatusChange(
      { status: 'contacted', lastContactedAt: earlier },
      { note: 'Left a voicemail.' },
      now,
    );

    expect(decision.status).toBe('contacted');
    expect(decision.lastContactedAt).toEqual(earlier);
    expect(decision.note).toBe('Left a voicemail.');
    expect(decision.moved).toBe(false);
    expect(decision.changed).toBe(true);
  });

  it('treats a repeated status plus a note as note-only', () => {
    const decision = applyStatusChange(
      { status: 'interested', lastContactedAt: earlier },
      { status: 'interested', note: 'Sent the schedule.' },
      now,
    );

    expect(decision.status).toBe('interested');
    expect(decision.lastContactedAt).toEqual(earlier);
    expect(decision.moved).toBe(false);
  });

  it('reaches paid from any status, and only through this function', () => {
    const decision = applyStatusChange(
      { status: 'interested', lastContactedAt: earlier },
      { status: 'paid', note: 'Payment verified in the bank.' },
      now,
    );

    expect(decision.status).toBe('paid');
    expect(decision.lastContactedAt).toEqual(now);
  });

  it('trims a note and treats a blank one as absent', () => {
    const trimmed = applyStatusChange(
      { status: 'new', lastContactedAt: null },
      { note: '  Called.  ' },
      now,
    );
    expect(trimmed.note).toBe('Called.');

    const blank = applyStatusChange(
      { status: 'new', lastContactedAt: null },
      { note: '   ' },
      now,
    );
    expect(blank.note).toBeNull();
    expect(blank.changed).toBe(false);
  });

  it('rejects an unknown status without changing anything', () => {
    expect(() =>
      applyStatusChange(
        { status: 'new', lastContactedAt: null },
        { status: 'negotiating' },
        now,
      ),
    ).toThrow(StatusChangeValidationError);
  });

  it('rejects a non-text note', () => {
    expect(() =>
      applyStatusChange(
        { status: 'new', lastContactedAt: null },
        { note: 42 },
        now,
      ),
    ).toThrow(StatusChangeValidationError);
  });
});

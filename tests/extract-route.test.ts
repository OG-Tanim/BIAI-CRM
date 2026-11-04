import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExtractHandler } from '@/lib/api/extract';
import { AiUnavailableError, type AiExtractor } from '@/lib/ai/extractor';
import { mockFixtureFor } from '@/lib/ai/mock-fixtures';
import { hasBengaliScript, hasUnfilledPlaceholder } from '@/lib/domain/extraction';

/**
 * Seam 2: the HTTP route, with the AI port replaced by a fake. No database is
 * configured in these tests on purpose — extraction must not need one.
 */
const BANGLISH_17 = 'Apnader course certificate ta ki govt approved?';
const BANGLA_2 = 'ফেলোশিপ প্রোগ্রামে ভর্তি হতে চাই। কবে শুরু হবে?';
const CORPORATE_3 =
  'I run a 40-person textile company in Gazipur. We want AI training for our team. Can someone call me this week?';
const PRICE_1 =
  'Assalamualaikum, apnader 3 day bootcamp er price koto? Payment kibhabe korbo?';
const REFUND_8 = 'Do you offer refunds if I cannot attend after paying?';

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

function fakeExtractor(answer: unknown): AiExtractor {
  return { extract: async () => answer };
}

function failingExtractor(error: Error): AiExtractor {
  return {
    extract: async () => {
      throw error;
    },
  };
}

function request(body: unknown): Request {
  return new Request('http://localhost/api/extract', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function fixture(message: string): Record<string, unknown> {
  const answer = mockFixtureFor(message);
  if (!answer) throw new Error(`No mock fixture for: ${message}`);
  return structuredClone(answer) as Record<string, unknown>;
}

async function extract(message: string, extractor?: AiExtractor) {
  const handler = createExtractHandler(
    extractor ?? fakeExtractor(fixture(message)),
  );
  return handler(request({ message }));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('POST /api/extract', () => {
  it('returns a complete prefilled proposal and no status', async () => {
    const response = await extract(BANGLISH_17);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(CONTRACT_KEYS);
    expect(body).not.toHaveProperty('status');
    expect(body).toMatchObject({
      name: 'Nowshin',
      channel: 'facebook',
      interest: 'unclear',
      kind: 'sales_lead',
      reply_language: 'banglish',
    });
  });

  it('separates a sender role and company from the name', async () => {
    const response = await extract(CORPORATE_3);
    const body = (await response.json()) as Record<string, unknown>;

    expect(body).toMatchObject({
      name: 'Mahmud Hasan',
      job_title: 'Managing Director',
      company: 'Gazipur textile company',
      interest: 'corporate',
    });
  });

  it('returns no phone when the message carries none', async () => {
    const response = await extract(BANGLA_2);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.phone).toBeNull();
  });

  it('answers a Bangla-script message in Bengali script', async () => {
    const response = await extract(BANGLA_2);
    const body = (await response.json()) as Record<string, unknown>;

    expect(body.reply_language).toBe('bn');
    expect(hasBengaliScript(body.suggested_reply as string)).toBe(true);
  });

  it('voids a reply that contradicts the Bangla-script guard', async () => {
    const answer = {
      ...fixture(BANGLA_2),
      reply_language: 'en',
      suggested_reply: 'Thanks for your message. We will get back to you soon.',
    };

    const response = await extract(BANGLA_2, fakeExtractor(answer));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.suggested_reply).toBeNull();
  });

  it('voids a reply carrying a placeholder outside the allowlist', async () => {
    const answer = {
      ...fixture(BANGLISH_17),
      suggested_reply: 'The next cohort starts {{cohort_two}}.',
    };

    const response = await extract(BANGLISH_17, fakeExtractor(answer));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.suggested_reply).toBeNull();
  });

  it('uses placeholders instead of asserting facts it does not know', async () => {
    for (const [message, token] of [
      [PRICE_1, '{{price}}'],
      [REFUND_8, '{{refund_policy}}'],
      [BANGLISH_17, '{{certificate}}'],
    ] as const) {
      const response = await extract(message);
      const body = (await response.json()) as {
        suggested_reply: string | null;
      };

      expect(response.status).toBe(200);
      expect(body.suggested_reply).toContain(token);
      expect(hasUnfilledPlaceholder(body.suggested_reply)).toBe(true);
    }
  });

  it('never writes a numeric price into the price reply', async () => {
    const response = await extract(PRICE_1);
    const body = (await response.json()) as { suggested_reply: string };

    expect(body.suggested_reply).toContain('{{price}}');
    expect(body.suggested_reply).toContain('{{payment_method}}');
    expect(body.suggested_reply).not.toMatch(/\d/);
  });

  it('extracts with no database configured at all', async () => {
    vi.stubEnv('TEST_DATABASE_URL', '');
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('DATABASE_BRANCH', '');

    const response = await extract(BANGLISH_17);

    expect(response.status).toBe(200);
  });

  it('rejects a missing message without calling the extractor', async () => {
    let calls = 0;
    const extractor: AiExtractor = {
      extract: async () => {
        calls += 1;
        return fixture(BANGLISH_17);
      },
    };
    const handler = createExtractHandler(extractor);

    const response = await handler(request({ message: '   ' }));

    expect(response.status).toBe(400);
    expect(calls).toBe(0);
  });

  it('rejects malformed JSON', async () => {
    const handler = createExtractHandler(fakeExtractor(fixture(BANGLISH_17)));
    const response = await handler(request('{'));

    expect(response.status).toBe(400);
  });

  it('returns 503 when AI is not configured', async () => {
    const response = await extract(
      BANGLISH_17,
      failingExtractor(new AiUnavailableError()),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: 'ai_unavailable' });
  });

  it('returns 502 when the AI provider fails', async () => {
    const response = await extract(
      BANGLISH_17,
      failingExtractor(new Error('socket hang up')),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: 'ai_failed' });
  });

  it('returns 422 when the model answer cannot be validated', async () => {
    const response = await extract(
      BANGLISH_17,
      fakeExtractor({ ...fixture(BANGLISH_17), name: '' }),
    );
    const body = (await response.json()) as { error: string; issues: string[] };

    expect(response.status).toBe(422);
    expect(body.error).toBe('invalid_extraction');
    expect(body.issues.join(' ')).toContain('name');
  });
});

describe('the Next.js route binding', () => {
  it('is wired at /api/extract and uses mock mode when MOCK_AI=1', async () => {
    vi.resetModules();
    vi.stubEnv('MOCK_AI', '1');

    const { POST } = await import('@/app/api/extract/route');
    const response = await POST(request({ message: BANGLISH_17 }));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(CONTRACT_KEYS);
    expect(body.name).toBe('Nowshin');
  });

  it('loads and answers 503 from the real binding when no AI is configured', async () => {
    vi.resetModules();
    vi.stubEnv('MOCK_AI', '0');
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('OPENROUTER_MODEL', '');

    const { POST } = await import('@/app/api/extract/route');
    const response = await POST(request({ message: BANGLISH_17 }));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: 'ai_unavailable' });
  });
});

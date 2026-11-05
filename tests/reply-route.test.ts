import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReplyHandler } from '@/lib/api/reply';
import { createMockReplyWriter, type ReplyWriter } from '@/lib/ai/reply';
import { AiUnavailableError } from '@/lib/ai/errors';
import { mockFixtureFor } from '@/lib/ai/mock-fixtures';

/**
 * Seam 2: the reply-only route, with the AI port replaced by a fake. No
 * database is configured on purpose — drafting a reply must not write or need
 * one.
 */
const BANGLISH_17 = 'Apnader course certificate ta ki govt approved?';
const BANGLA_2 = 'ফেলোশিপ প্রোগ্রামে ভর্তি হতে চাই। কবে শুরু হবে?';
const PRICE_1 =
  'Assalamualaikum, apnader 3 day bootcamp er price koto? Payment kibhabe korbo?';

function fakeWriter(answer: unknown): ReplyWriter {
  return { write: async () => answer };
}

function failingWriter(error: Error): ReplyWriter {
  return {
    write: async () => {
      throw error;
    },
  };
}

function request(body: unknown): Request {
  return new Request('http://localhost/api/reply', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function fixture(message: string): Record<string, unknown> {
  const answer = mockFixtureFor(message);
  if (!answer) throw new Error(`No mock fixture for: ${message}`);
  const record = structuredClone(answer) as Record<string, unknown>;

  return {
    reply: record.suggested_reply,
  };
}

async function generate(message: string, writer?: ReplyWriter) {
  const handler = createReplyHandler(writer ?? fakeWriter(fixture(message)));
  return handler(request({ message }));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('POST /api/reply', () => {
  it('returns exactly the reply', async () => {
    const response = await generate(BANGLISH_17);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(Object.keys(body)).toEqual(['reply']);
    expect(body.reply).toContain('{{certificate}}');
  });

  it('answers a Bangla-script message with Bengali script', async () => {
    const response = await generate(BANGLA_2);
    const body = (await response.json()) as Record<string, unknown>;
    const expected = fixture(BANGLA_2);

    expect(response.status).toBe(200);
    expect(body.reply).toBe(expected.reply);
    expect(body.reply).toMatch(/[\u0980-\u09FF]/);
  });

  it('uses the model reply unchanged', async () => {
    const response = await generate(BANGLA_2, {
      write: async () => ({
        reply: 'Thanks for your message. We will get back to you soon.',
      }),
    });
    const body = (await response.json()) as { reply: string | null };

    expect(response.status).toBe(200);
    expect(body.reply).toBe(
      'Thanks for your message. We will get back to you soon.',
    );
  });

  it('drops a reply_language the model volunteers', async () => {
    const response = await generate(BANGLISH_17, {
      write: async () => ({
        reply: 'Our certificate is {{certificate}}.',
        reply_language: 'banglish',
      }),
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(Object.keys(body)).toEqual(['reply']);
  });

  it('passes an unknown placeholder through unchanged', async () => {
    const response = await generate(BANGLISH_17, {
      write: async () => ({
        reply: 'The next cohort starts {{cohort_two}}.',
      }),
    });
    const body = (await response.json()) as { reply: string | null };

    expect(response.status).toBe(200);
    expect(body.reply).toBe('The next cohort starts {{cohort_two}}.');
  });

  it('accepts suggested_reply from a model confused by the extraction field', async () => {
    const response = await generate(BANGLISH_17, {
      write: async () => ({
        suggested_reply: 'Our certificate is {{certificate}}.',
      }),
    });
    const body = (await response.json()) as { reply: string | null };

    expect(response.status).toBe(200);
    expect(body.reply).toContain('{{certificate}}');
  });

  it('uses placeholders instead of asserting facts it does not know', async () => {
    const response = await generate(PRICE_1);
    const body = (await response.json()) as { reply: string };

    expect(response.status).toBe(200);
    expect(body.reply).toContain('{{price}}');
    expect(body.reply).toContain('{{payment_method}}');
    expect(body.reply).not.toMatch(/\d/);
  });

  it('rejects a missing message without calling the writer', async () => {
    let calls = 0;
    const writer: ReplyWriter = {
      write: async () => {
        calls += 1;
        return fixture(BANGLISH_17);
      },
    };
    const handler = createReplyHandler(writer);

    const response = await handler(request({ message: '   ' }));

    expect(response.status).toBe(400);
    expect(calls).toBe(0);
  });

  it('rejects malformed JSON', async () => {
    const handler = createReplyHandler(fakeWriter(fixture(BANGLISH_17)));
    const response = await handler(request('{'));

    expect(response.status).toBe(400);
  });

  it('returns 503 when AI is not configured', async () => {
    const response = await generate(
      BANGLISH_17,
      failingWriter(new AiUnavailableError()),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: 'ai_unavailable' });
  });

  it('returns 502 when the AI provider fails', async () => {
    const response = await generate(
      BANGLISH_17,
      failingWriter(new Error('socket hang up')),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: 'ai_failed' });
  });

  it('returns 422 when the model answer cannot be validated', async () => {
    const response = await generate(BANGLISH_17, {
      write: async () => 'not an object',
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: 'invalid_reply' });
  });

  it('drafts the fixture reply in mock mode', async () => {
    const handler = createReplyHandler(createMockReplyWriter());
    const response = await handler(request({ message: BANGLISH_17 }));
    const body = (await response.json()) as {
      reply: string | null;
    };

    expect(response.status).toBe(200);
    expect(body.reply).toContain('{{certificate}}');
  });

  it('drafts a reply with no database configured at all', async () => {
    vi.stubEnv('TEST_DATABASE_URL', '');
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('DATABASE_BRANCH', '');

    const response = await generate(BANGLISH_17);

    expect(response.status).toBe(200);
  });
});

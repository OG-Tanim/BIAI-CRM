import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiResponseError, AiUnavailableError } from '@/lib/ai/errors';
import { createExtractorFromEnv, createOpenRouterExtractor } from '@/lib/ai/extractor';
import {
  createOpenRouterReplyWriter,
  createReplyWriterFromEnv,
} from '@/lib/ai/reply';
import { createOpenRouterClient, resolveTimeoutMs } from '@/lib/ai/openrouter';
import {
  createOpenRouterNarrator,
  createSummaryNarratorFromEnv,
  SUMMARY_SYSTEM_PROMPT,
} from '@/lib/ai/summary';
import {
  emptyKindCounts,
  emptyStatusCounts,
  type SummaryFacts,
} from '@/lib/domain/summary';

/**
 * Seam 0: the one HTTP client both AI ports sit on, plus the budgets they ask
 * for. No network — every reply below is a canned OpenRouter envelope.
 *
 * The regression this file exists for: a reasoning model bills its thinking
 * against `max_tokens` and answers with `content: null` once the budget runs
 * out. Both ports sized that budget for the answer alone, so free reasoning
 * models returned nothing and the summary page logged "no message content"
 * on every load.
 */

const FACTS: SummaryFacts = {
  window: {
    days: 7,
    from: '2026-10-28T00:00:00.000Z',
    to: '2026-11-04T00:00:00.000Z',
  },
  received: 12,
  received_by_kind: {
    ...emptyKindCounts(),
    sales_lead: 7,
    job_seeker: 2,
    spam: 1,
    support: 1,
    unclear: 1,
  },
  moved: 3,
  stuck: 4,
  leads_by_status: {
    ...emptyStatusCounts(),
    new: 5,
    contacted: 2,
    interested: 1,
    paid: 1,
  },
  generated_at: '2026-11-04T00:00:00.000Z',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** An OpenRouter completion envelope; `content: null` mimics a truncation. */
function completion(
  content: string | null,
  finishReason = content === null ? 'length' : 'stop',
): Response {
  return json({
    choices: [{ message: { role: 'assistant', content }, finish_reason: finishReason }],
  });
}

function clientWith(fetchImpl: typeof fetch) {
  return createOpenRouterClient({ apiKey: 'test-key', model: 'test/model', fetchImpl });
}

/** Run one port against a fake fetch and return the body it sent. */
async function captureRequest(
  call: (fetchImpl: typeof fetch) => Promise<unknown>,
): Promise<Record<string, unknown>> {
  let body: Record<string, unknown> = {};
  const fetchImpl = async (_url: RequestInfo | URL, init?: RequestInit) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return completion('{"ok":true}');
  };

  await call(fetchImpl);
  return body;
}

const SIMPLE_REQUEST = {
  messages: [{ role: 'user' as const, content: 'hi' }],
  maxTokens: 100,
};

describe('openrouter client', () => {
  it('returns the message content', async () => {
    const client = clientWith(async () => completion('two sentences'));

    await expect(client.complete(SIMPLE_REQUEST)).resolves.toBe('two sentences');
  });

  it('retries once with backoff on 429 and then succeeds', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ error: 'rate limited' }, 429))
      .mockResolvedValueOnce(completion('after the retry'));
    const sleep = vi.fn(async () => {});

    const client = createOpenRouterClient({
      apiKey: 'test-key',
      model: 'test/model',
      fetchImpl,
      sleep,
    });

    await expect(client.complete(SIMPLE_REQUEST)).resolves.toBe('after the retry');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('does not retry a 4xx the operator caused', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json({}, 400));

    await expect(clientWith(fetchImpl).complete(SIMPLE_REQUEST)).rejects.toThrow(
      'AI provider returned HTTP 400.',
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('names the token budget when a reasoning model is cut off', async () => {
    const fetchImpl = async () =>
      json({
        choices: [
          {
            message: { role: 'assistant', content: null },
            finish_reason: 'length',
          },
        ],
        usage: { completion_tokens_details: { reasoning_tokens: 400 } },
      });

    const failure = clientWith(fetchImpl).complete({
      ...SIMPLE_REQUEST,
      maxTokens: 400,
    });

    await expect(failure).rejects.toBeInstanceOf(AiResponseError);
    await expect(failure).rejects.toThrow(
      'ran out of tokens before writing an answer: the 400-token budget was consumed (400 of them reasoning tokens)',
    );
  });

  it('keeps the plain message when the model answered nothing at all', async () => {
    const fetchImpl = async () => completion(null, 'stop');

    await expect(clientWith(fetchImpl).complete(SIMPLE_REQUEST)).rejects.toThrow(
      'AI provider returned no message content.',
    );
  });
});

describe('AI ports ask for a budget that covers a reasoning phase', () => {
  it('the narrator budgets for thinking and the answer', async () => {
    const body = await captureRequest((fetchImpl) =>
      createOpenRouterNarrator({
        apiKey: 'test-key',
        model: 'test/model',
        fetchImpl,
      }).narrate(FACTS),
    );

    expect(body.max_tokens).toBeGreaterThanOrEqual(2_000);
    expect(body.messages).toEqual([
      { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
      { role: 'user', content: expect.stringContaining('Database facts for the week') },
    ]);
  });

  it('never shows the narrator a number it could copy', async () => {
    const body = await captureRequest((fetchImpl) =>
      createOpenRouterNarrator({
        apiKey: 'test-key',
        model: 'test/model',
        fetchImpl,
      }).narrate(FACTS),
    );

    const [, user] = body.messages as Array<{ content: string }>;
    const everyCount = {
      '{{received}}': FACTS.received,
      '{{sales_leads}}': FACTS.received_by_kind.sales_lead,
      '{{job_seekers}}': FACTS.received_by_kind.job_seeker,
      '{{support}}': FACTS.received_by_kind.support,
      '{{spam}}': FACTS.received_by_kind.spam,
      '{{unclear}}': FACTS.received_by_kind.unclear,
      '{{moved}}': FACTS.moved,
      '{{stuck}}': FACTS.stuck,
    };

    // The count values are 12, 7, 2, 1, 3 and 4; none may appear as a digit,
    // and no raw fact value may appear at all.
    for (const token of Object.keys(everyCount)) {
      expect(user.content).toContain(token);
    }
    expect(user.content).not.toMatch(/[0-9]/);
    expect(user.content).not.toContain(String(FACTS.received));
  });

  it('the system prompt carries the worked example that keeps prose numeric-free', () => {
    expect(SUMMARY_SYSTEM_PROMPT).toContain('WORKED EXAMPLE');
    expect(SUMMARY_SYSTEM_PROMPT).toContain(
      'GOOD: "We received {{received}} enquiries this week',
    );
    expect(SUMMARY_SYSTEM_PROMPT).toContain(
      'BAD: "We received 12 enquiries this week."',
    );
  });

  it('the extractor budgets for thinking and the JSON object', async () => {
    const body = await captureRequest((fetchImpl) =>
      createOpenRouterExtractor({
        apiKey: 'test-key',
        model: 'test/model',
        fetchImpl,
      }).extract('Assalamualaikum, price koto?'),
    );

    expect(body.max_tokens).toBeGreaterThanOrEqual(2_000);
    expect(body.response_format).toEqual({ type: 'json_object' });
  });
});

describe('thinking is off for every AI call', () => {
  const ports: Array<[string, (fetchImpl: typeof fetch) => Promise<unknown>]> = [
    [
      'extractor',
      (fetchImpl) =>
        createOpenRouterExtractor({
          apiKey: 'test-key',
          model: 'test/model',
          fetchImpl,
        }).extract('price koto?'),
    ],
    [
      'reply writer',
      (fetchImpl) =>
        createOpenRouterReplyWriter({
          apiKey: 'test-key',
          model: 'test/model',
          fetchImpl,
        }).write('price koto?'),
    ],
    [
      'narrator',
      (fetchImpl) =>
        createOpenRouterNarrator({
          apiKey: 'test-key',
          model: 'test/model',
          fetchImpl,
        }).narrate(FACTS),
    ],
  ];

  it.each(ports)('sends the flag for the %s', async (_port, call) => {
    const body = await captureRequest(call);

    // `enable_thinking` is a chat-template flag. A top-level copy is ignored
    // by the local MLX server, so it would be false comfort to send one.
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(body).not.toHaveProperty('enable_thinking');
  });
});

describe('OPENROUTER_TIMEOUT_MS is the one ceiling every AI call uses', () => {
  const LIVE_ENV = {
    MOCK_AI: '0',
    OPENROUTER_API_KEY: 'test-key',
    OPENROUTER_MODEL: 'test/model',
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to 45 seconds when the variable is unset', () => {
    expect(resolveTimeoutMs(LIVE_ENV)).toBe(45_000);
  });

  it('reads the configured value', () => {
    expect(
      resolveTimeoutMs({ ...LIVE_ENV, OPENROUTER_TIMEOUT_MS: '120000' }),
    ).toBe(120_000);
  });

  it('falls back instead of failing on a value that cannot be a timeout', () => {
    for (const raw of ['', '   ', 'slow', '0', '-1', 'Infinity']) {
      expect(
        resolveTimeoutMs({ ...LIVE_ENV, OPENROUTER_TIMEOUT_MS: raw }),
      ).toBe(45_000);
    }
  });

  /**
   * A fetch that settles only when the client's AbortSignal fires, so the test
   * observes the ceiling each port actually installed rather than a helper's
   * return value.
   */
  function hangingFetch(): typeof fetch {
    return (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener('abort', () => reject(signal.reason));
      });
  }

  const ports: Array<[string, () => Promise<unknown>]> = [
    [
      'extractor',
      () =>
        createExtractorFromEnv({
          ...LIVE_ENV,
          OPENROUTER_TIMEOUT_MS: '25',
        }).extract('price koto?'),
    ],
    [
      'reply writer',
      () =>
        createReplyWriterFromEnv({
          ...LIVE_ENV,
          OPENROUTER_TIMEOUT_MS: '25',
        }).write('price koto?'),
    ],
    [
      'weekly narrator',
      () =>
        createSummaryNarratorFromEnv({
          ...LIVE_ENV,
          OPENROUTER_TIMEOUT_MS: '25',
        }).narrate(FACTS),
    ],
  ];

  it.each(ports)('enforces it for the %s', async (_port, call) => {
    vi.stubGlobal('fetch', hangingFetch());

    await expect(call()).rejects.toBeInstanceOf(AiUnavailableError);
  });
});

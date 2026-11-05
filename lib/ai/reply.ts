import {
  REPLY_SYSTEM_PROMPT,
  buildReplyUserPrompt,
} from '@/lib/ai/prompt';
import { mockExtractionFor } from '@/lib/ai/mock-fixtures';
import { resolveAiMode } from '@/lib/ai/availability';
import { AiUnavailableError } from '@/lib/ai/errors';
import { parseModelJson } from '@/lib/ai/model-json';
import { createOpenRouterClient, resolveTimeoutMs } from '@/lib/ai/openrouter';

/**
 * The reply-only AI port.
 *
 * It exists because "generate a reply" is a smaller decision than "extract an
 * enquiry". The reply route may not fill identity fields, and keeping the
 * contract to `reply` alone means a reply request cannot move a status or
 * invent a phone number. The reply language is chosen inside the prompt and is
 * not part of the contract.
 */
export type ReplyWriter = {
  write(message: string): Promise<unknown>;
};

type Env = Record<string, string | undefined>;

/**
 * Reply-only output is short, but a reasoning model still spends tokens before
 * writing. 2,000 leaves room for that thought and the JSON envelope.
 */
const REPLY_MAX_TOKENS = 2_000;

export type OpenRouterReplyConfig = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export function createOpenRouterReplyWriter(
  config: OpenRouterReplyConfig,
): ReplyWriter {
  const client = createOpenRouterClient({
    apiKey: config.apiKey,
    model: config.model,
    baseUrl: config.baseUrl,
    fetchImpl: config.fetchImpl,
    timeoutMs: config.timeoutMs,
  });

  return {
    async write(message: string): Promise<unknown> {
      const content = await client.complete({
        messages: [
          { role: 'system', content: REPLY_SYSTEM_PROMPT },
          { role: 'user', content: buildReplyUserPrompt(message) },
        ],
        maxTokens: REPLY_MAX_TOKENS,
        jsonMode: true,
      });

      return parseModelJson(content);
    },
  };
}

/**
 * Mock mode reuses the extraction fixtures: the reply half of the same canned
 * answer is exactly the reply a fixture-backed extraction would propose.
 */
export function createMockReplyWriter(): ReplyWriter {
  return {
    async write(message: string): Promise<unknown> {
      const fixture = mockExtractionFor(message) as {
        suggested_reply?: unknown;
      };

      return {
        reply: fixture.suggested_reply ?? null,
      };
    },
  };
}

function unavailableReplyWriter(reason: string): ReplyWriter {
  return {
    async write(): Promise<unknown> {
      throw new AiUnavailableError(reason);
    },
  };
}

export function createReplyWriterFromEnv(env: Env = process.env): ReplyWriter {
  const mode = resolveAiMode(env);

  if (mode === 'mock') {
    return createMockReplyWriter();
  }

  if (mode === 'unavailable') {
    return unavailableReplyWriter(
      'Set OPENROUTER_API_KEY and OPENROUTER_MODEL, or set MOCK_AI=1.',
    );
  }

  return createOpenRouterReplyWriter({
    apiKey: env.OPENROUTER_API_KEY!.trim(),
    model: env.OPENROUTER_MODEL!.trim(),
    baseUrl: env.OPENROUTER_BASE_URL,
    timeoutMs: resolveTimeoutMs(env),
  });
}

export function getReplyWriter(env: Env = process.env): ReplyWriter {
  return createReplyWriterFromEnv(env);
}

import {
  EXTRACTION_SYSTEM_PROMPT,
  buildExtractionUserPrompt,
} from '@/lib/ai/prompt';
import { mockExtractionFor } from '@/lib/ai/mock-fixtures';
import { resolveAiMode } from '@/lib/ai/availability';
import { AiResponseError, AiUnavailableError } from '@/lib/ai/errors';
import { parseModelJson } from '@/lib/ai/model-json';
import { createOpenRouterClient, resolveTimeoutMs } from '@/lib/ai/openrouter';

/**
 * The extraction AI port. `ReplyWriter` in `lib/ai/reply.ts` is the narrower
 * port used when the operator asks for only a reply. Both turn one message into
 * an unvalidated model answer and are replaceable in tests and in mock mode.
 */
export type AiExtractor = {
  extract(message: string): Promise<unknown>;
};

// The failure types predate this module. Re-exporting them keeps every caller
// and route import working while the definitions live in one place.
export { AiResponseError, AiUnavailableError };

type Env = Record<string, string | undefined>;

/**
 * The JSON answer is short, but `max_tokens` also pays for a reasoning phase:
 * on the sample messages a free reasoning model spent over 1,300 tokens
 * thinking, so 1,200 returned no JSON at all on most attempts. 2,500 leaves
 * room for the thought and the object, and costs nothing when the model stops
 * early.
 */
const EXTRACTION_MAX_TOKENS = 2_500;

export type OpenRouterConfig = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export function createOpenRouterExtractor(config: OpenRouterConfig): AiExtractor {
  const client = createOpenRouterClient({
    apiKey: config.apiKey,
    model: config.model,
    baseUrl: config.baseUrl,
    fetchImpl: config.fetchImpl,
    timeoutMs: config.timeoutMs,
  });

  return {
    async extract(message: string): Promise<unknown> {
      const content = await client.complete({
        messages: [
          { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
          { role: 'user', content: buildExtractionUserPrompt(message) },
        ],
        maxTokens: EXTRACTION_MAX_TOKENS,
        jsonMode: true,
      });

      return parseModelJson(content);
    },
  };
}

export function createMockExtractor(): AiExtractor {
  return {
    async extract(message: string): Promise<unknown> {
      return mockExtractionFor(message);
    },
  };
}

function unavailableExtractor(reason: string): AiExtractor {
  return {
    async extract(): Promise<unknown> {
      throw new AiUnavailableError(reason);
    },
  };
}

/**
 * Choose the extractor for this process. `MOCK_AI=1` always wins so a local
 * session never accidentally spends a request; without credentials the
 * extractor exists but fails with `AiUnavailableError`, which the route turns
 * into a 503 instead of crashing the server.
 */
export function createExtractorFromEnv(env: Env = process.env): AiExtractor {
  const mode = resolveAiMode(env);

  if (mode === 'mock') {
    return createMockExtractor();
  }

  if (mode === 'unavailable') {
    return unavailableExtractor(
      'Set OPENROUTER_API_KEY and OPENROUTER_MODEL, or set MOCK_AI=1.',
    );
  }

  const apiKey = env.OPENROUTER_API_KEY!.trim();
  const model = env.OPENROUTER_MODEL!.trim();

  return createOpenRouterExtractor({
    apiKey,
    model,
    baseUrl: env.OPENROUTER_BASE_URL,
    timeoutMs: resolveTimeoutMs(env),
  });
}

export function getExtractor(env: Env = process.env): AiExtractor {
  return createExtractorFromEnv(env);
}

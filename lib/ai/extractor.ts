import {
  EXTRACTION_SYSTEM_PROMPT,
  buildExtractionUserPrompt,
} from '@/lib/ai/prompt';
import { mockExtractionFor } from '@/lib/ai/mock-fixtures';
import { resolveAiMode } from '@/lib/ai/availability';
import { AiResponseError, AiUnavailableError } from '@/lib/ai/errors';
import { createOpenRouterClient } from '@/lib/ai/openrouter';

/**
 * The single AI port. Everything above this line sees a plain function that
 * turns one message into an unvalidated model answer; everything below is
 * replaceable in tests and in mock mode.
 */
export type AiExtractor = {
  extract(message: string): Promise<unknown>;
};

// The failure types predate this module. Re-exporting them keeps every caller
// and route import working while the definitions live in one place.
export { AiResponseError, AiUnavailableError };

type Env = Record<string, string | undefined>;

export type OpenRouterConfig = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/**
 * Parse the JSON object out of a model answer, tolerating a stray code fence
 * or a sentence before the object. It still has to be valid JSON: a reply we
 * cannot parse is an AI failure, not something to repair by hand.
 */
function parseModelJson(content: string): unknown {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');

  if (start === -1 || end <= start) {
    throw new AiResponseError('The model did not return a JSON object.');
  }

  try {
    return JSON.parse(content.slice(start, end + 1));
  } catch {
    throw new AiResponseError('The model returned malformed JSON.');
  }
}

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
        maxTokens: 1200,
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
  });
}

export function getExtractor(env: Env = process.env): AiExtractor {
  return createExtractorFromEnv(env);
}

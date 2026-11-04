import {
  EXTRACTION_SYSTEM_PROMPT,
  buildExtractionUserPrompt,
} from '@/lib/ai/prompt';
import { mockExtractionFor } from '@/lib/ai/mock-fixtures';
import { resolveAiMode } from '@/lib/ai/availability';

/**
 * The single AI port. Everything above this line sees a plain function that
 * turns one message into an unvalidated model answer; everything below is
 * replaceable in tests and in mock mode.
 */
export type AiExtractor = {
  extract(message: string): Promise<unknown>;
};

export class AiUnavailableError extends Error {
  constructor(message = 'AI extraction is not configured.') {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

export class AiResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiResponseError';
  }
}

type Env = Record<string, string | undefined>;

export type OpenRouterConfig = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_TIMEOUT_MS = 45_000;

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: unknown } }>;
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
  const baseUrl = (config.baseUrl?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const fetchImpl = config.fetchImpl ?? fetch;

  return {
    async extract(message: string): Promise<unknown> {
      let response: Response;

      try {
        response = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
            'X-Title': 'BIAI CRM',
          },
          body: JSON.stringify({
            model: config.model,
            temperature: 0,
            max_tokens: 1200,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
              { role: 'user', content: buildExtractionUserPrompt(message) },
            ],
          }),
          signal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        });
      } catch (error) {
        throw new AiUnavailableError(
          error instanceof Error
            ? `AI request failed: ${error.message}`
            : 'AI request failed.',
        );
      }

      if (!response.ok) {
        throw new AiResponseError(`AI provider returned HTTP ${response.status}.`);
      }

      let payload: ChatCompletionResponse;
      try {
        payload = (await response.json()) as ChatCompletionResponse;
      } catch {
        throw new AiResponseError('AI provider returned a non-JSON response.');
      }

      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.trim() === '') {
        throw new AiResponseError('AI provider returned no message content.');
      }

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

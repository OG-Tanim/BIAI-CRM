import { AiResponseError, AiUnavailableError } from '@/lib/ai/errors';

/**
 * The one OpenRouter chat client.
 *
 * Extraction and the weekly narration differ only in prompt, token budget and
 * whether the answer must be JSON. Everything else — the endpoint, the
 * headers, the timeout, the response envelope, and the single retry the spec
 * promises on 429/5xx — lives here so a provider change is made once.
 */

export type ChatMessage = {
  role: 'system' | 'user';
  content: string;
};

export type ChatRequest = {
  messages: ChatMessage[];
  maxTokens: number;
  /** Ask for `response_format: { type: 'json_object' }`. */
  jsonMode?: boolean;
  timeoutMs?: number;
};

export type OpenRouterClientConfig = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retryDelayMs?: number;
  /** Injectable so a test never actually sleeps. */
  sleep?: (ms: number) => Promise<void>;
};

export type OpenRouterClient = {
  complete(request: ChatRequest): Promise<string>;
};

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_RETRY_DELAY_MS = 750;

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: unknown } }>;
};

/**
 * The spec's retry rule: one retry with backoff on 429 and 5xx, then a clear
 * failure. A 4xx the operator caused is not worth a second request.
 */
function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

export function createOpenRouterClient(
  config: OpenRouterClientConfig,
): OpenRouterClient {
  const baseUrl = (config.baseUrl?.trim() || DEFAULT_BASE_URL).replace(
    /\/+$/,
    '',
  );
  const fetchImpl = config.fetchImpl ?? fetch;
  const retryDelayMs = config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const sleep =
    config.sleep ??
    ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

  async function post(
    request: ChatRequest,
    timeoutMs: number,
  ): Promise<Response> {
    try {
      return await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          'X-Title': 'BIAI CRM',
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0,
          max_tokens: request.maxTokens,
          ...(request.jsonMode
            ? { response_format: { type: 'json_object' } }
            : {}),
          messages: request.messages,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new AiUnavailableError(
        error instanceof Error
          ? `AI request failed: ${error.message}`
          : 'AI request failed.',
      );
    }
  }

  return {
    async complete(request: ChatRequest): Promise<string> {
      const timeoutMs =
        request.timeoutMs ?? config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

      let response = await post(request, timeoutMs);

      if (!response.ok && isRetryable(response.status)) {
        await sleep(retryDelayMs);
        response = await post(request, timeoutMs);
      }

      if (!response.ok) {
        throw new AiResponseError(
          `AI provider returned HTTP ${response.status}.`,
        );
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

      return content;
    },
  };
}

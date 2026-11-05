import { AiResponseError, AiUnavailableError } from '@/lib/ai/errors';

/**
 * The one OpenRouter chat client.
 *
 * Extraction and the weekly narration differ only in prompt, token budget and
 * whether the answer must be JSON. Everything else — the endpoint, the
 * headers, the timeout, the thinking switch, the response envelope, and the
 * single retry the spec promises on 429/5xx — lives here so a provider change
 * is made once.
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

/**
 * How long one attempt may run, configured once for every AI call.
 *
 * The ceiling that suits a hosted free model is not the ceiling that suits a
 * reasoning model on a laptop, so `OPENROUTER_TIMEOUT_MS` is a setting rather
 * than three constants that drift apart. A set-but-unusable value falls back
 * to the default instead of failing every request: the timeout is a safety
 * net, and a typo in it must not take the AI down by itself.
 */
export function resolveTimeoutMs(
  env: Record<string, string | undefined> = process.env,
  fallbackMs: number = DEFAULT_TIMEOUT_MS,
): number {
  const raw = env.OPENROUTER_TIMEOUT_MS?.trim();
  if (!raw) return fallbackMs;

  const ms = Number(raw);
  return Number.isFinite(ms) && ms >= 1 ? Math.floor(ms) : fallbackMs;
}

/**
 * Reasoning models (Qwen3 and its relatives) think before they answer, which
 * spends `max_tokens` and seconds on a phase nobody reads, and leaves
 * `content: null` when the budget runs out mid-thought.
 *
 * There are two switches, because the providers disagree on the field name.
 *
 * `enable_thinking` is a chat-template flag, not an OpenAI field: vLLM and the
 * local MLX server read it from `chat_template_kwargs`, and a top-level
 * `enable_thinking` is silently ignored (measured against the local MLX
 * server).
 *
 * OpenRouter ignores `chat_template_kwargs` entirely — it accepts the field
 * without error, which is worse than rejecting it, because the request looks
 * fixed while the model keeps thinking. Its own parameter is `reasoning`, and
 * `effort: "none"` disables the phase. Without it a reasoning model can spend
 * the whole budget on thoughts and return an empty `content`: the 2000-token
 * reply budget disappearing into 2000 reasoning tokens is exactly that failure.
 */
const THINKING_OFF = {
  chat_template_kwargs: { enable_thinking: false },
} as const;

/** OpenRouter's own "do not think" switch; see above. */
const OPENROUTER_REASONING_OFF = {
  reasoning: { effort: 'none' },
} as const;

/**
 * True only when the configured endpoint is OpenRouter itself.
 *
 * `OPENROUTER_BASE_URL` may point at a self-hosted OpenAI-compatible server,
 * which is why the two switches are not sent together: an unknown field is
 * tolerated by OpenRouter and not by every local server.
 */
function talksToOpenRouter(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname.endsWith('openrouter.ai');
  } catch {
    return false;
  }
}

type ChatCompletionResponse = {
  choices?: Array<{
    message?: { content?: unknown };
    finish_reason?: unknown;
  }>;
  usage?: { completion_tokens_details?: { reasoning_tokens?: unknown } };
};

/**
 * The spec's retry rule: one retry with backoff on 429 and 5xx, then a clear
 * failure. A 4xx the operator caused is not worth a second request.
 */
function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

function asCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * A 200 with no prose is two different failures, and they need different
 * fixes. A reasoning model spends `max_tokens` on its thinking tokens first;
 * when the budget was sized for the answer alone, it is cut off mid-thought
 * and returns `content: null` with `finish_reason: "length"`. Reporting that
 * as "no message content" sent the operator looking at the prompt instead of
 * the budget, so say which one happened.
 */
function emptyContentError(
  finishReason: unknown,
  reasoningTokens: number | null,
  maxTokens: number,
): AiResponseError {
  if (finishReason !== 'length') {
    return new AiResponseError('AI provider returned no message content.');
  }

  const spent =
    reasoningTokens === null
      ? ''
      : ` (${reasoningTokens} of them reasoning tokens)`;

  return new AiResponseError(
    `AI model ran out of tokens before writing an answer: the ${maxTokens}-token budget was consumed${spent}. Raise max_tokens or use a model without a reasoning phase.`,
  );
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
  const onOpenRouter = talksToOpenRouter(baseUrl);
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
          ...THINKING_OFF,
          ...(onOpenRouter ? OPENROUTER_REASONING_OFF : {}),
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

      const choice = payload.choices?.[0];
      const finishReason = choice?.finish_reason;
      const reasoningTokens = asCount(
        payload.usage?.completion_tokens_details?.reasoning_tokens,
      );

      const content = choice?.message?.content;
      if (typeof content === 'string' && content.trim() !== '') {
        return content;
      }

      throw emptyContentError(
        finishReason,
        reasoningTokens,
        request.maxTokens,
      );
    },
  };
}

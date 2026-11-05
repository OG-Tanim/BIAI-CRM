import { AiUnavailableError } from '@/lib/ai/errors';
import { createOpenRouterClient, resolveTimeoutMs } from '@/lib/ai/openrouter';
import { resolveAiMode } from '@/lib/ai/availability';
import {
  SUMMARY_COUNT_TOKENS,
  type SummaryFacts,
} from '@/lib/domain/summary';

/**
 * The AI port for the weekly summary.
 *
 * It returns prose with count placeholders. It never selects, counts or
 * remembers anything itself, and the real implementation never even sees the
 * numbers: each count reaches the model as its placeholder, so the only value
 * a reader can see is the one `renderSummaryNarration` substitutes from the
 * database facts. A template that carries a digit of its own is rejected
 * outright rather than displayed.
 */
export type SummaryNarrator = {
  narrate(facts: SummaryFacts): Promise<string>;
};

const TOKEN_LIST = SUMMARY_COUNT_TOKENS.map((token) => `{{${token}}}`).join(
  ', ',
);

/**
 * The narration is two sentences, but `max_tokens` also pays for the model's
 * reasoning, and a reasoning model thinks before it writes. At 400 the weekly
 * summary was cut off mid-thought on every request and returned no prose at
 * all. 3,000 covers a measured ~1,400-token reasoning phase plus the answer,
 * and costs nothing extra when the model stops early.
 */
const SUMMARY_MAX_TOKENS = 3_000;

/**
 * The narrator's fallback ceiling when `OPENROUTER_TIMEOUT_MS` is unset.
 *
 * A reasoning phase runs to tens of seconds on free models, so the old 30s
 * timeout cut off answers that were about to arrive rather than hung ones.
 */
const SUMMARY_TIMEOUT_MS = 45_000;

export const SUMMARY_SYSTEM_PROMPT = `You write the weekly summary for the sales team of BIAI, an AI training company in Bangladesh.

The server has already computed every count from the database. It gives you the facts with each count already replaced by its placeholder, so you never see the underlying numbers and cannot copy, round or invent one. You only put the supplied facts into two or three plain English sentences.

RULES, highest priority first:

1. Never write a digit. Not a count, not a date, not a percentage, not a number word. A digit anywhere, in any script, voids the whole summary. Wherever a count belongs, write one of these placeholders exactly: ${TOKEN_LIST}.
2. The server replaces each placeholder with the true database value after you answer. A placeholder used twice is fine; a token outside the list voids the whole summary.
3. Mention at least one count. The summary exists to narrate the numbers.
4. Use only the facts supplied. Do not invent a trend, a cause, a person, or a comparison the facts do not support.
5. Two or three sentences, plain text, no heading, no bullet points, no markdown, no signature.

WORKED EXAMPLE:
BAD: "We received 12 enquiries this week."
GOOD: "We received {{received}} enquiries this week, {{sales_leads}} of them sales leads."
BAD: "Enquiries rose in the last 7 days."
GOOD: "{{received}} enquiries arrived this week and {{moved}} sales leads moved on."

WHAT THE FACTS MEAN:
- received: every enquiry created in the last seven days.
- received_by_kind: those enquiries split by kind. sales_lead is genuine sales interest; job_seeker, support, spam and unclear are not deals.
- moved: sales leads that changed status in the last seven days.
- stuck: sales leads in New or Contacted that nobody has contacted for two days or more.

Write only the summary text.`;

/**
 * The facts, with every value replaced by the placeholder that will fill it.
 *
 * The model used to receive the raw numbers, and on the free router most
 * live requests copied one straight into the prose ("12 enquiries"), which
 * the renderer must then reject: a summary with the model's number in it is
 * how an invented statistic ships. The model's job is prose around
 * placeholders, not arithmetic, so it now sees the token in place of the
 * value and cannot leak a number it never saw. Dates and the pipeline
 * breakdown are left out for the same reason: no token names them, so the
 * model could only write a digit or say nothing.
 */
export function buildSummaryUserPrompt(): string {
  const masked = {
    received: '{{received}}',
    received_by_kind: {
      sales_lead: '{{sales_leads}}',
      job_seeker: '{{job_seekers}}',
      support: '{{support}}',
      spam: '{{spam}}',
      unclear: '{{unclear}}',
    },
    moved: '{{moved}}',
    stuck: '{{stuck}}',
  };

  return `Database facts for the week. Every count is already its placeholder:\n\n${JSON.stringify(
    masked,
    null,
    2,
  )}\n\nWrite the summary now. Use only these placeholders for counts: ${TOKEN_LIST}.`;
}

export type OpenRouterNarratorConfig = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export function createOpenRouterNarrator(
  config: OpenRouterNarratorConfig,
): SummaryNarrator {
  const client = createOpenRouterClient({
    apiKey: config.apiKey,
    model: config.model,
    baseUrl: config.baseUrl,
    fetchImpl: config.fetchImpl,
    timeoutMs: config.timeoutMs ?? SUMMARY_TIMEOUT_MS,
  });

  return {
    async narrate(): Promise<string> {
      // Deliberately not `facts` as data: the counts reach the model as
      // placeholders only. See buildSummaryUserPrompt.
      return client.complete({
        messages: [
          { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
          { role: 'user', content: buildSummaryUserPrompt() },
        ],
        maxTokens: SUMMARY_MAX_TOKENS,
      });
    },
  };
}

export function createMockNarrator(): SummaryNarrator {
  return {
    async narrate(): Promise<string> {
      return '{{received}} enquiries arrived this week, including {{sales_leads}} sales leads. {{moved}} leads moved and {{stuck}} are in the follow-up queue.';
    },
  };
}

function unavailableNarrator(reason: string): SummaryNarrator {
  return {
    async narrate(): Promise<string> {
      throw new AiUnavailableError(reason);
    },
  };
}

type Env = Record<string, string | undefined>;

/**
 * Choose the narrator for this process. As with extraction, `MOCK_AI=1` wins
 * so a local session never spends a request, and missing credentials produce a
 * clear failure instead of a crash.
 */
export function createSummaryNarratorFromEnv(
  env: Env = process.env,
): SummaryNarrator {
  const mode = resolveAiMode(env);

  if (mode === 'mock') {
    return createMockNarrator();
  }

  if (mode === 'unavailable') {
    return unavailableNarrator(
      'Set OPENROUTER_API_KEY and OPENROUTER_MODEL, or set MOCK_AI=1.',
    );
  }

  const apiKey = env.OPENROUTER_API_KEY!.trim();
  const model = env.OPENROUTER_MODEL!.trim();

  return createOpenRouterNarrator({
    apiKey,
    model,
    baseUrl: env.OPENROUTER_BASE_URL,
    timeoutMs: resolveTimeoutMs(env, SUMMARY_TIMEOUT_MS),
  });
}

export function getSummaryNarrator(env: Env = process.env): SummaryNarrator {
  return createSummaryNarratorFromEnv(env);
}

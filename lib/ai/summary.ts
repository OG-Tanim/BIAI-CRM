import { AiUnavailableError } from '@/lib/ai/errors';
import { createOpenRouterClient } from '@/lib/ai/openrouter';
import { resolveAiMode } from '@/lib/ai/availability';
import {
  SUMMARY_COUNT_TOKENS,
  type SummaryFacts,
} from '@/lib/domain/summary';

/**
 * The AI port for the weekly summary.
 *
 * It receives facts already computed by the database and returns prose with
 * count placeholders. It never selects, counts or remembers anything itself:
 * `renderSummaryNarration` fills the placeholders from the same facts and
 * rejects a template that carries a number of its own.
 */
export type SummaryNarrator = {
  narrate(facts: SummaryFacts): Promise<string>;
};

const TOKEN_LIST = SUMMARY_COUNT_TOKENS.map((token) => `{{${token}}}`).join(
  ', ',
);

export const SUMMARY_SYSTEM_PROMPT = `You write the weekly summary for the sales team of BIAI, an AI training company in Bangladesh.

The server has already computed every count from the database and gives them to you as JSON. You do not compute, estimate, remember or infer numbers. You only put the supplied facts into two or three plain English sentences.

RULES, highest priority first:

1. Never write a digit. Not a count, not a date, not a percentage, not a number word. Wherever a count belongs, write one of these placeholders exactly: ${TOKEN_LIST}.
2. The server replaces each placeholder with the true database value after you answer. A placeholder used twice is fine; a token outside the list voids the whole summary.
3. Mention at least one count. The summary exists to narrate the numbers.
4. Use only the JSON facts supplied. Do not invent a trend, a cause, a person, or a comparison the facts do not support.
5. Two or three sentences, plain text, no heading, no bullet points, no markdown, no signature.

WHAT THE FACTS MEAN:
- received: every enquiry created in the last seven days.
- received_by_kind: those enquiries split by kind. sales_lead is genuine sales interest; job_seeker, support, spam and unclear are not deals.
- moved: sales leads that changed status in the last seven days.
- stuck: sales leads in New or Contacted that nobody has contacted for at least 48 hours.
- leads_by_status: the current shape of the sales pipeline.

Write only the summary text.`;

export function buildSummaryUserPrompt(facts: SummaryFacts): string {
  return `Database facts for the week:\n\n${JSON.stringify(facts, null, 2)}\n\nWrite the summary now. Use only these placeholders for counts: ${TOKEN_LIST}.`;
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
    timeoutMs: config.timeoutMs ?? 30_000,
  });

  return {
    async narrate(facts: SummaryFacts): Promise<string> {
      return client.complete({
        messages: [
          { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
          { role: 'user', content: buildSummaryUserPrompt(facts) },
        ],
        maxTokens: 400,
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
  });
}

export function getSummaryNarrator(env: Env = process.env): SummaryNarrator {
  return createSummaryNarratorFromEnv(env);
}

/**
 * One answer to "is AI switched on?" for the whole process.
 *
 * The layout uses it to warn a reviewer, the extractor uses it to choose the
 * real client, and the narrator uses it for the weekly summary. Keeping the
 * decision here means the banner and the two AI ports cannot disagree.
 */
export type AiMode = 'live' | 'mock' | 'unavailable';

type Env = Record<string, string | undefined>;

export function resolveAiMode(env: Env = process.env): AiMode {
  // Mock mode wins even when a key is present, so a local session cannot
  // accidentally spend a request.
  if (env.MOCK_AI === '1') return 'mock';

  return env.OPENROUTER_API_KEY?.trim() && env.OPENROUTER_MODEL?.trim()
    ? 'live'
    : 'unavailable';
}

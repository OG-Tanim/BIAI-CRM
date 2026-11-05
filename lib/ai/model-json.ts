import { AiResponseError } from '@/lib/ai/errors';

/**
 * Parse the JSON object out of a model answer, tolerating a stray code fence
 * or a sentence before the object. It still has to be valid JSON: an answer we
 * cannot parse is an AI failure, not something to repair by hand.
 *
 * Shared by extraction and reply-only generation, so both AI routes reject
 * drift in the same way.
 */
export function parseModelJson(content: string): unknown {
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

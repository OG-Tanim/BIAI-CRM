/**
 * The one `{{token}}` scanner.
 *
 * Replies, the enquiry detail editor and the weekly narration all speak the
 * same placeholder language. Keeping the pattern and the token rules here
 * means a token is read the same way everywhere; only the allowlist differs,
 * and each caller owns its own.
 *
 * Matching is deliberately literal: `{{ price }}` is not `{{price}}`, because
 * the allowlists are exact and a model that pads a token has already drifted
 * from the contract every caller validates against.
 */

const PLACEHOLDER_PATTERN = /\{\{([^{}]*)\}\}/g;

/**
 * The tokens a piece of text carries, deduplicated, exactly as written.
 *
 * Empty tokens (`{{}}`) are returned rather than ignored, so an allowlist
 * check rejects them instead of silently passing a malformed reply.
 */
export function placeholderTokens(text: string | null | undefined): string[] {
  if (typeof text !== 'string') return [];

  const tokens = new Set<string>();
  for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
    tokens.add(match[1] ?? '');
  }
  return [...tokens];
}

/** Replace every token with the text its owner supplies. */
export function replacePlaceholders(
  text: string,
  replacement: (token: string) => string,
): string {
  return text.replace(PLACEHOLDER_PATTERN, (_match, token: string) =>
    replacement(token),
  );
}

/**
 * True while a reply still has a template token in it. Guards the copy action:
 * saving a draft is fine, sending `{{price}}` to a customer is not.
 */
export function hasUnfilledPlaceholder(
  reply: string | null | undefined,
): boolean {
  return typeof reply === 'string' && reply.includes('{{');
}

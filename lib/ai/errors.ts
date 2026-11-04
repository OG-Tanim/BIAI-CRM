/**
 * The AI failures every caller maps to an HTTP status.
 *
 * Kept apart from the clients so the extractor and the narrator share one
 * definition: `instanceof` checks in the routes must not depend on which module
 * happened to import which client first.
 */

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

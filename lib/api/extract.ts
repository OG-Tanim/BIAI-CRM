import { NextResponse } from 'next/server';
import { AiUnavailableError, type AiExtractor } from '@/lib/ai/extractor';
import {
  ExtractionValidationError,
  validateExtraction,
} from '@/lib/domain/extraction';

/**
 * `POST /api/extract` — paste one message, get one editable proposal.
 *
 * Nothing is written here: no database, no files, no status. The extractor is
 * injected so the route can be tested with a fake that returns fixtures.
 */
export function createExtractHandler(extractor: AiExtractor) {
  return async function POST(request: Request): Promise<NextResponse> {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'invalid_json', message: 'Request body must be JSON.' },
        { status: 400 },
      );
    }

    const message =
      typeof body === 'object' && body !== null && 'message' in body
        ? (body as { message?: unknown }).message
        : undefined;

    if (typeof message !== 'string' || message.trim() === '') {
      return NextResponse.json(
        { error: 'message_required', message: 'Provide a non-empty "message".' },
        { status: 400 },
      );
    }

    let raw: unknown;

    try {
      raw = await extractor.extract(message);
    } catch (error) {
      if (error instanceof AiUnavailableError) {
        console.error('[extract] AI unavailable:', error.message);
        return NextResponse.json(
          { error: 'ai_unavailable', message: 'AI extraction is unavailable.' },
          { status: 503 },
        );
      }

      console.error(
        '[extract] AI request failed:',
        error instanceof Error ? error.message : 'unknown error',
      );
      return NextResponse.json(
        { error: 'ai_failed', message: 'AI extraction failed. Try again.' },
        { status: 502 },
      );
    }

    try {
      // The raw message is passed in because the Bengali-script guard is about
      // the message, not about what the model claims to have read.
      return NextResponse.json(validateExtraction(raw, message), { status: 200 });
    } catch (error) {
      if (!(error instanceof ExtractionValidationError)) throw error;

      console.error('[extract] invalid extraction:', error.issues.join('; '));
      return NextResponse.json(
        {
          error: 'invalid_extraction',
          message: 'The AI response did not match the extraction contract.',
          issues: error.issues,
        },
        { status: 422 },
      );
    }
  };
}

export type ExtractHandler = ReturnType<typeof createExtractHandler>;

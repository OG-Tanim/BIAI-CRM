import { NextResponse } from 'next/server';
import { AiUnavailableError, type AiExtractor } from '@/lib/ai/extractor';
import { readJsonObject } from '@/lib/api/request-body';
import {
  ExtractionValidationError,
  validateExtraction,
} from '@/lib/domain/extraction';
import { logFailure } from '@/lib/log';

/**
 * `POST /api/extract` — paste one message, get one editable proposal.
 *
 * Nothing is written here: no database, no files, no status. The extractor is
 * injected so the route can be tested with a fake that returns fixtures.
 */
export function createExtractHandler(extractor: AiExtractor) {
  return async function POST(request: Request): Promise<NextResponse> {
    const parsed = await readJsonObject(request);

    if (!parsed.ok) return parsed.response;

    const message = parsed.body.message;

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
        logFailure('extract', 'AI availability', error);
        return NextResponse.json(
          { error: 'ai_unavailable', message: 'AI extraction is unavailable.' },
          { status: 503 },
        );
      }

      logFailure('extract', 'AI request', error);
      return NextResponse.json(
        { error: 'ai_failed', message: 'AI extraction failed. Try again.' },
        { status: 502 },
      );
    }

    try {
      return NextResponse.json(validateExtraction(raw), { status: 200 });
    } catch (error) {
      if (!(error instanceof ExtractionValidationError)) throw error;

      logFailure('extract', 'validation', error);
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

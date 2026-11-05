import { NextResponse } from 'next/server';
import { type ReplyWriter } from '@/lib/ai/reply';
import { AiUnavailableError } from '@/lib/ai/errors';
import { readJsonObject } from '@/lib/api/request-body';
import {
  ExtractionValidationError,
  validateReplyDraft,
} from '@/lib/domain/extraction';
import { logFailure } from '@/lib/log';

/**
 * `POST /api/reply` — paste one message, get one reply draft.
 *
 * Nothing is written here. The handler is the reply-only counterpart to
 * `/api/extract`: it returns text only, never identity fields or a status, so
 * the Generate reply button cannot alter the rest of the form. The reply
 * language is handled inside the prompt and never leaves the server.
 */
export function createReplyHandler(writer: ReplyWriter) {
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
      raw = await writer.write(message);
    } catch (error) {
      if (error instanceof AiUnavailableError) {
        logFailure('reply', 'AI availability', error);
        return NextResponse.json(
          { error: 'ai_unavailable', message: 'AI reply generation is unavailable.' },
          { status: 503 },
        );
      }

      logFailure('reply', 'AI request', error);
      return NextResponse.json(
        { error: 'ai_failed', message: 'Could not generate a reply. Try again.' },
        { status: 502 },
      );
    }

    try {
      return NextResponse.json(validateReplyDraft(raw), { status: 200 });
    } catch (error) {
      if (!(error instanceof ExtractionValidationError)) throw error;

      logFailure('reply', 'validation', error);
      return NextResponse.json(
        {
          error: 'invalid_reply',
          message: 'The AI response did not match the reply contract.',
          issues: error.issues,
        },
        { status: 422 },
      );
    }
  };
}

export type ReplyHandler = ReturnType<typeof createReplyHandler>;

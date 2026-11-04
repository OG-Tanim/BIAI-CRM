import { NextResponse } from 'next/server';

/**
 * Read a JSON object body, or answer the 400 the client caused.
 *
 * Three handlers used to repeat this parsing and its two error shapes; the
 * status and the error codes are part of the API contract, so they belong in
 * one place.
 */
export type JsonObjectBody =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; response: NextResponse };

export async function readJsonObject(
  request: Request,
): Promise<JsonObjectBody> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'invalid_json', message: 'Request body must be JSON.' },
        { status: 400 },
      ),
    };
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'invalid_body', message: 'Request body must be a JSON object.' },
        { status: 400 },
      ),
    };
  }

  return { ok: true, body: body as Record<string, unknown> };
}

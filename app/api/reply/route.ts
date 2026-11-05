import { createReplyHandler } from '@/lib/api/reply';
import { getReplyWriter } from '@/lib/ai/reply';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Thin binding: the handler lives in `lib/api/reply.ts` so tests can inject a
 * fake writer. This file is only the HTTP entry point.
 */
export const POST = createReplyHandler(getReplyWriter());

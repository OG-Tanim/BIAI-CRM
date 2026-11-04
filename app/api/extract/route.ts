import { createExtractHandler } from '@/lib/api/extract';
import { getExtractor } from '@/lib/ai/extractor';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Thin binding: the handler lives in `lib/api/extract.ts` so tests can inject a
 * fake extractor. This file is only the HTTP entry point.
 */
export const POST = createExtractHandler(getExtractor());

import { createPipelineHandler } from '@/lib/api/pipeline';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Thin binding: the handler lives in `lib/api/pipeline.ts` so tests can inject a transaction. */
export const GET = createPipelineHandler();

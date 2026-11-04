import { createSummaryHandler } from '@/lib/api/summary';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Thin binding: the handler lives in `lib/api/summary.ts` so tests can inject a transaction and a narrator. */
export const POST = createSummaryHandler();

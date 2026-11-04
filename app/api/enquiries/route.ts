import { createEnquiriesHandler } from '@/lib/api/enquiries';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Thin binding: the handler lives in `lib/api/enquiries.ts` so tests can inject
 * a throwaway database. This file is only the HTTP entry point.
 */
export const POST = createEnquiriesHandler();

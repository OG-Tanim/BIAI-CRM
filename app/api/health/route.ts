import { createHealthHandler } from '@/lib/api/health';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * The route is a binding only: the branch label and the row counts come from
 * `lib/api/health`, whose port the tests replace.
 */
export const GET = createHealthHandler();

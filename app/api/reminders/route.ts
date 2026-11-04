import { createRemindersHandler } from '@/lib/api/reminders';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Thin binding: the handler lives in `lib/api/reminders.ts` so tests can inject a transaction. */
export const GET = createRemindersHandler();

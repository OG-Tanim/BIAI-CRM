import { createEnquiriesHandler } from '@/lib/api/enquiries';
import { createEnquiryListHandler } from '@/lib/api/enquiry-list';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Thin binding: the handlers live in `lib/api/` so tests can inject a
 * throwaway database. This file is only the HTTP entry point.
 */
export const POST = createEnquiriesHandler();
export const GET = createEnquiryListHandler();

import { createEnquiryUpdateHandler } from '@/lib/api/enquiry-update';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Thin binding for one card update; see `createEnquiryUpdateHandler`. */
export const PATCH = createEnquiryUpdateHandler();

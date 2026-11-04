import { createEnquiryUpdateHandler } from '@/lib/api/enquiries';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Thin binding for one card move or note; see `createEnquiryUpdateHandler`. */
export const PATCH = createEnquiryUpdateHandler();

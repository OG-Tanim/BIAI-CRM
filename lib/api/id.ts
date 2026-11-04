/**
 * The one enquiry-id shape check.
 *
 * The update route and the detail page both accept an id from the URL; a
 * malformed one is a 404 before any query reaches Postgres.
 */
const ENQUIRY_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isEnquiryId(value: string): boolean {
  return ENQUIRY_ID_PATTERN.test(value);
}

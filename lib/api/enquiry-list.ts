import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { getDb } from '@/lib/db/client';
import { enquiries } from '@/lib/db/schema';
import type * as schema from '@/lib/db/schema';
import { toEnquiryDto, type EnquiryDto } from '@/lib/api/enquiry-dto';
import { KINDS, STATUSES, type Kind, type Status } from '@/lib/domain/enquiry';
import { logFailure } from '@/lib/log';

type Database = PostgresJsDatabase<typeof schema>;
type EnquiryListStore = Pick<Database, 'select'>;

export type EnquiryFilters = {
  status: Status | null;
  kind: Kind | null;
};

export type EnquiryListResponse = {
  enquiries: EnquiryDto[];
  total: number;
  filters: EnquiryFilters;
};

/**
 * Accept one filter value.
 *
 * An absent or empty parameter means "all". An unknown value is a reported
 * error rather than a silent fallback: a list that quietly ignores a filter
 * tells the operator they have seen everything when they have not.
 */
function parseFilterValue<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
  field: string,
  issues: string[],
): T | null {
  if (value === undefined || value === null || value === '') return null;

  if (!(allowed as readonly string[]).includes(value)) {
    issues.push(`${field}: must be one of ${allowed.join(', ')}.`);
    return null;
  }

  return value as T;
}

/** Read the list filters the way the page and the endpoint both receive them. */
export function parseEnquiryFilters(input: {
  status?: string | null;
  kind?: string | null;
}): { filters: EnquiryFilters; issues: string[] } {
  const issues: string[] = [];

  const status = parseFilterValue(input.status, STATUSES, 'status', issues);
  const kind = parseFilterValue(input.kind, KINDS, 'kind', issues);

  return { filters: { status, kind }, issues };
}

/**
 * The list view is deliberately not the board: it shows every kind of
 * enquiry, because finding a support thread or a job seeker is a legitimate
 * reason to leave the pipeline. The board's exclusion lives in
 * `loadPipeline`, not here.
 */
export async function fetchEnquiryList(
  db: EnquiryListStore,
  filters: EnquiryFilters,
): Promise<EnquiryListResponse> {
  const where =
    filters.status && filters.kind
      ? and(eq(enquiries.status, filters.status), eq(enquiries.kind, filters.kind))
      : filters.status
        ? eq(enquiries.status, filters.status)
        : filters.kind
          ? eq(enquiries.kind, filters.kind)
          : undefined;

  const rows = await db
    .select()
    .from(enquiries)
    .where(where)
    .orderBy(desc(enquiries.createdAt));

  return {
    enquiries: rows.map(toEnquiryDto),
    total: rows.length,
    filters,
  };
}

/** `GET /api/enquiries?status=&kind=` — the filterable list. */
export function createEnquiryListHandler(
  options: { db?: EnquiryListStore } = {},
) {
  return async function GET(request: Request): Promise<NextResponse> {
    const url = new URL(request.url);
    const { filters, issues } = parseEnquiryFilters({
      status: url.searchParams.get('status'),
      kind: url.searchParams.get('kind'),
    });

    if (issues.length > 0) {
      return NextResponse.json(
        {
          error: 'invalid_filter',
          message: 'The list filter is not valid.',
          issues,
        },
        { status: 400 },
      );
    }

    const db = options.db ?? getDb();

    try {
      return NextResponse.json(await fetchEnquiryList(db, filters));
    } catch (error) {
      logFailure('enquiries', 'list', error);

      return NextResponse.json(
        { error: 'list_failed', message: 'Could not load the enquiry list.' },
        { status: 500 },
      );
    }
  };
}

export type EnquiryListHandler = ReturnType<typeof createEnquiryListHandler>;

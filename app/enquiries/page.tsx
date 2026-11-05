import Link from 'next/link';
import { PageLoadError } from '@/app/_components/page-load-error';
import {
  fetchEnquiryList,
  parseEnquiryFilters,
  type EnquiryListResponse,
} from '@/lib/api/enquiry-list';
import { loadPageData } from '@/lib/api/page-load';
import { getDb } from '@/lib/db/client';
import { KINDS, STATUSES } from '@/lib/domain/enquiry';
import {
  INTEREST_LABELS,
  KIND_LABELS,
  STATUS_LABELS,
  formatDateTime,
} from '@/lib/format';
import { DeleteEnquiryButton } from './delete-button';

export const dynamic = 'force-dynamic';

const LOAD_FAILURE =
  'Could not load the enquiry list. Check the database connection and reload.';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const statusParam = typeof params.status === 'string' ? params.status : null;
  const kindParam = typeof params.kind === 'string' ? params.kind : null;
  const { filters, issues } = parseEnquiryFilters({
    status: statusParam,
    kind: kindParam,
  });
  const filtered = filters.status !== null || filters.kind !== null;

  const loaded =
    issues.length === 0
      ? await loadPageData<EnquiryListResponse>(
          { label: 'enquiries page', action: 'list', failure: LOAD_FAILURE },
          () => fetchEnquiryList(getDb(), filters),
        )
      : { data: null, error: null };

  const list = loaded.data;
  const loadError = loaded.error;

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-7xl flex-col gap-6 px-6 py-8">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
          Enquiries
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          All enquiries
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">
          Every kind of enquiry, including the non-leads kept off the board.
          Filter by status, kind, or both to find a specific person.
        </p>
      </header>

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <label className="text-xs font-medium text-slate-700">
          Status
          <select
            name="status"
            defaultValue={filters.status ?? ''}
            className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          >
            <option value="">All statuses</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-medium text-slate-700">
          Kind
          <select
            name="kind"
            defaultValue={filters.kind ?? ''}
            className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          >
            <option value="">All kinds</option>
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Filter
        </button>

        <Link
          href="/enquiries"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Clear
        </Link>
      </form>

      {issues.length > 0 ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          That filter is not valid. {issues.join(' ')}
        </p>
      ) : null}

      {loadError ? <PageLoadError message={loadError} /> : null}

      {list ? (
        list.total === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
            <p className="text-sm font-medium text-slate-800">
              {filtered
                ? 'No enquiries match this filter.'
                : 'No enquiries yet.'}
            </p>
            <p className="mx-auto mt-1 max-w-xl text-sm text-slate-600">
              {filtered
                ? 'Clear the filter to see every enquiry, or capture a new one from the Capture page.'
                : 'Every captured enquiry appears here, including spam, job seekers and support threads kept off the pipeline. Capture the first one to start the list.'}
            </p>
            <Link
              href={filtered ? '/enquiries' : '/'}
              className="mt-4 inline-block rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              {filtered ? 'Clear the filter' : 'Capture an enquiry'}
            </Link>
          </div>
        ) : (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">
                {list.total} {list.total === 1 ? 'enquiry' : 'enquiries'}
              </h2>
              <p className="text-xs text-slate-500">
                {filters.status
                  ? `Status: ${STATUS_LABELS[filters.status]}`
                  : 'All statuses'}
                {' · '}
                {filters.kind ? `Kind: ${KIND_LABELS[filters.kind]}` : 'All kinds'}
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Person
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Interest
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Kind
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Created
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Last contacted
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Detail
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.enquiries.map((enquiry) => (
                    <tr key={enquiry.id} className="align-top">
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/enquiries/${enquiry.id}`}
                            className="font-medium text-slate-900 underline-offset-2 hover:underline"
                          >
                            {enquiry.name}
                          </Link>
                          {enquiry.needs_attention ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                              Attention
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-slate-600">
                          {enquiry.company ?? 'No company'} ·{' '}
                          {enquiry.job_title ?? 'No role'}
                        </p>
                        {enquiry.phone ? (
                          <p className="text-xs text-slate-500">
                            {enquiry.phone}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {INTEREST_LABELS[enquiry.interest]}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                          {KIND_LABELS[enquiry.kind]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                          {STATUS_LABELS[enquiry.status]}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                        {formatDateTime(enquiry.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                        {formatDateTime(enquiry.last_contacted_at)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs">
                        <span className="flex flex-col items-start gap-1">
                          <Link
                            href={`/enquiries/${enquiry.id}`}
                            className="font-medium text-slate-700 hover:text-slate-900"
                          >
                            Open
                          </Link>
                          <DeleteEnquiryButton
                            id={enquiry.id}
                            name={enquiry.name}
                          />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
      ) : null}
    </main>
  );
}

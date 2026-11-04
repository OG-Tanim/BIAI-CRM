import Link from 'next/link';
import { PageLoadError } from '@/app/_components/page-load-error';
import { getSummaryNarrator } from '@/lib/ai/summary';
import { loadPageData } from '@/lib/api/page-load';
import { loadSummaryFacts } from '@/lib/api/summary';
import { getDb } from '@/lib/db/client';
import { KINDS, STATUSES } from '@/lib/domain/enquiry';
import {
  renderSummaryNarration,
  type SummaryFacts,
} from '@/lib/domain/summary';
import {
  KIND_LABELS,
  STATUS_LABELS,
  formatDateTime,
} from '@/lib/format';
import { logFailure } from '@/lib/log';

export const dynamic = 'force-dynamic';

const LOAD_FAILURE =
  'Could not compute the weekly summary. Check the database connection and reload.';

export default async function SummaryPage() {
  const { data: facts, error } = await loadPageData<SummaryFacts>(
    { label: 'summary page', action: 'aggregate', failure: LOAD_FAILURE },
    () => loadSummaryFacts(getDb()),
  );

  let narrative: string | null = null;
  let narrationNotice: string | null = null;

  const hasSummaryData =
    facts !== null &&
    (facts.received > 0 ||
      STATUSES.some((status) => facts.leads_by_status[status] > 0));

  if (facts && hasSummaryData) {
    try {
      const template = await getSummaryNarrator().narrate(facts);
      narrative = renderSummaryNarration(template, facts);
    } catch (error) {
      logFailure('summary page', 'narrate', error);
      narrationNotice =
        'The counts below are live, but the written summary is unavailable right now. Check the AI configuration and reload.';
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-7xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
            Summary
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            The last seven days
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">
            Every number on this page is counted by the database. The written
            summary narrates those counts through placeholders the server
            fills; the model never supplies a number of its own.
          </p>
        </div>
        {facts ? (
          <p className="text-xs text-slate-500">
            {formatDateTime(facts.window.from)} →{' '}
            {formatDateTime(facts.window.to)}
          </p>
        ) : null}
      </header>

      {facts === null ? (
        <PageLoadError message={error ?? LOAD_FAILURE} />
      ) : !hasSummaryData ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
          <p className="text-sm font-semibold text-slate-800">
            Nothing to summarise yet.
          </p>
          <p className="mx-auto mt-1 max-w-xl text-sm leading-relaxed text-slate-600">
            No enquiries arrived in this seven-day window and there are no
            sales leads on the board. Capture the first enquiry and the counts,
            the week in words and the pipeline shape will fill in from the
            database.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Capture an enquiry
          </Link>
        </div>
      ) : (
        <>
          <section
            aria-labelledby="narrative-heading"
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h2
              id="narrative-heading"
              className="text-sm font-semibold text-slate-900"
            >
              The week in words
            </h2>
            {narrative ? (
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-700">
                {narrative}
              </p>
            ) : (
              <p
                role="status"
                className="mt-2 max-w-3xl rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"
              >
                {narrationNotice}
              </p>
            )}
          </section>

          <section
            aria-label="Headline counts"
            className="grid gap-4 sm:grid-cols-3"
          >
            <FactCard
              label="Came in"
              value={facts.received}
              detail="Enquiries created in the last seven days, every kind."
              href="/enquiries"
            />
            <FactCard
              label="Moved"
              value={facts.moved}
              detail="Sales leads no longer New with activity in the last seven days."
              href="/pipeline"
            />
            <FactCard
              label="Stuck"
              value={facts.stuck}
              detail="Open sales leads with no contact for at least 48 hours."
              href="/follow-ups"
            />
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <header className="border-b border-slate-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-900">
                  What came in, by kind
                </h2>
              </header>
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <tbody className="divide-y divide-slate-100">
                  {KINDS.map((kind) => (
                    <tr key={kind}>
                      <th
                        scope="row"
                        className="px-4 py-2 text-left font-medium text-slate-700"
                      >
                        {KIND_LABELS[kind]}
                      </th>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-900">
                        {facts.received_by_kind[kind]}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50">
                    <th
                      scope="row"
                      className="px-4 py-2 text-left font-semibold text-slate-900"
                    >
                      Total
                    </th>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums text-slate-900">
                      {facts.received}
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <header className="border-b border-slate-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-900">
                  The sales pipeline now
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Current sales leads by status, not only this week&apos;s.
                </p>
              </header>
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <tbody className="divide-y divide-slate-100">
                  {STATUSES.map((status) => (
                    <tr key={status}>
                      <th
                        scope="row"
                        className="px-4 py-2 text-left font-medium text-slate-700"
                      >
                        {STATUS_LABELS[status]}
                      </th>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-900">
                        {facts.leads_by_status[status]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          <p className="text-xs text-slate-500">
            Counts were generated at {formatDateTime(facts.generated_at)} from
            the database. Spam, job seekers, support threads and unclear
            messages are counted as arrivals but never as sales leads.
          </p>
        </>
      )}
    </main>
  );
}

function FactCard({
  label,
  value,
  detail,
  href,
}: {
  label: string;
  value: number;
  detail: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow"
    >
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">
        {value}
      </span>
      <span className="mt-1 text-xs leading-relaxed text-slate-600">
        {detail}
      </span>
    </Link>
  );
}

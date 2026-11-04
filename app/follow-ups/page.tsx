import Link from 'next/link';
import {
  fetchFollowUps,
  type RemindersResponse,
} from '@/lib/api/reminders';
import { getDb } from '@/lib/db/client';
import { INTEREST_LABELS, STATUS_LABELS, formatAge, formatDateTime } from '@/lib/format';
import { logFailure } from '@/lib/log';

export const dynamic = 'force-dynamic';

export default async function FollowUpsPage() {
  let queue: RemindersResponse | null = null;

  try {
    queue = await fetchFollowUps(getDb());
  } catch (error) {
    logFailure('follow-ups page', 'load', error);
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-7xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
            Follow-ups
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Gone quiet for 48 hours
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">
            Sales leads in New or Contacted that nobody has reached for at
            least 48 hours, measured from the last contact when there was one
            and from creation otherwise. Oldest first.
          </p>
        </div>
        {queue ? (
          <p className="text-sm text-slate-600">
            <span className="font-semibold text-slate-900">{queue.total}</span>{' '}
            {queue.total === 1 ? 'person needs' : 'people need'} a follow-up
          </p>
        ) : null}
      </header>

      {queue === null ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          Could not load the follow-up queue. Check the database connection and
          reload.
        </p>
      ) : queue.total === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-800">
            Nobody has been forgotten.
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Every open sales lead has been contacted within the last 48 hours.
          </p>
          <Link
            href="/pipeline"
            className="mt-4 inline-block rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Back to the pipeline
          </Link>
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              {queue.total} {queue.total === 1 ? 'enquiry' : 'enquiries'}
            </h2>
            <p className="text-xs text-slate-500">
              Including everything whose last contact or creation is at or
              before {formatDateTime(queue.rule.cutoff)}.
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
                    Status
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Waiting since
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Age
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {queue.enquiries.map((enquiry) => (
                  <tr key={enquiry.id} className="align-top">
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-900">
                          {enquiry.name}
                        </span>
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
                        <p className="text-xs text-slate-500">{enquiry.phone}</p>
                      ) : null}
                      {enquiry.summary ? (
                        <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-600">
                          {enquiry.summary}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {INTEREST_LABELS[enquiry.interest]}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {STATUS_LABELS[enquiry.status]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                      <span className="block">
                        {formatDateTime(enquiry.waiting_since)}
                      </span>
                      <span className="text-slate-500">
                        {enquiry.last_contacted_at
                          ? 'last contact'
                          : 'creation'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                      {formatAge(enquiry.age_seconds)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

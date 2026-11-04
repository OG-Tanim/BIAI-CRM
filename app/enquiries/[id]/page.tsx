import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchEnquiryDetail } from '@/lib/api/enquiry-detail';
import { isEnquiryId } from '@/lib/api/id';
import { getDb } from '@/lib/db/client';
import {
  INTEREST_LABELS,
  KIND_LABELS,
  STATUS_LABELS,
  formatDateTime,
} from '@/lib/format';
import { logFailure } from '@/lib/log';
import { ReplyPanel } from './reply-panel';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

const BADGE =
  'rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700';

/**
 * One enquiry, in full.
 *
 * The list deliberately shows a row per person; this is where the evidence
 * lives: the message exactly as it arrived, the reply template and the filled
 * version, and every note attached while the card moved.
 */
export default async function EnquiryDetailPage({ params }: { params: Params }) {
  const { id } = await params;

  if (!isEnquiryId(id)) notFound();

  let detail: Awaited<ReturnType<typeof fetchEnquiryDetail>> = null;
  let loadError: string | null = null;

  try {
    detail = await fetchEnquiryDetail(getDb(), id);
  } catch (error) {
    logFailure('enquiry detail', 'load', error);
    loadError =
      'Could not load this enquiry. Check the database connection and reload.';
  }

  if (loadError) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-3xl flex-col gap-6 px-6 py-8">
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {loadError}
        </p>
        <Link
          href="/enquiries"
          className="self-start rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Back to the list
        </Link>
      </main>
    );
  }

  if (!detail) notFound();

  const { enquiry, notes } = detail;

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-5xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
          <Link href="/enquiries" className="hover:text-slate-900">
            ← All enquiries
          </Link>
          <span aria-hidden="true">·</span>
          <Link href="/pipeline" className="hover:text-slate-900">
            Pipeline
          </Link>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {enquiry.name}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {enquiry.company ?? 'No company'} ·{' '}
              {enquiry.job_title ?? 'No role'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {enquiry.needs_attention ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                Attention
              </span>
            ) : null}
            <span className={BADGE}>{STATUS_LABELS[enquiry.status]}</span>
            <span className={BADGE}>{KIND_LABELS[enquiry.kind]}</span>
            <span className={BADGE}>{INTEREST_LABELS[enquiry.interest]}</span>
          </div>
        </div>
      </header>

      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Contact
          </p>
          <dl className="mt-2 space-y-1 text-sm text-slate-700">
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-slate-500">Phone</dt>
              <dd>{enquiry.phone ?? 'No phone number'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-slate-500">Channel</dt>
              <dd className="capitalize">{enquiry.channel}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-slate-500">Handle</dt>
              <dd>{enquiry.channel_handle ?? '—'}</dd>
            </div>
          </dl>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Timeline
          </p>
          <dl className="mt-2 space-y-1 text-sm text-slate-700">
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-slate-500">Created</dt>
              <dd>{formatDateTime(enquiry.created_at)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-slate-500">Contacted</dt>
              <dd>{formatDateTime(enquiry.last_contacted_at)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-slate-500">Moved</dt>
              <dd>{formatDateTime(enquiry.updated_at)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">
          Original message
        </h2>
        <p className="mt-1 text-xs text-slate-600">
          Stored verbatim and never overwritten.
        </p>
        <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-800">
          {enquiry.raw_message}
        </pre>
      </section>

      <ReplyPanel enquiry={enquiry} />

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Notes</h2>
        <p className="mt-1 text-xs text-slate-600">
          Every note written while this card moved, oldest first.
        </p>

        {notes.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">
            No notes on this enquiry yet. A note is added from the board when a
            card moves.
          </p>
        ) : (
          <ol className="mt-3 flex flex-col gap-3">
            {notes.map((note) => (
              <li
                key={note.id}
                className="rounded-xl border border-slate-200 bg-slate-50 p-3"
              >
                <p className="text-xs text-slate-500">
                  {formatDateTime(note.created_at)}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                  {note.body}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

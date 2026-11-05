'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type {
  PipelineCard,
  PipelineResponse,
} from '@/lib/api/pipeline';
import { messageFrom } from '@/lib/api/error-message';
import { STATUSES, type Status } from '@/lib/domain/enquiry';
import {
  INTEREST_LABELS,
  KIND_LABELS,
  STATUS_LABELS,
  formatAge,
} from '@/lib/format';

type UpdateBody = {
  status?: Status;
  note?: string;
  needs_attention?: boolean;
};
type UpdateResult = Promise<boolean>;

export function PipelineBoard({
  initialPipeline,
}: {
  initialPipeline: PipelineResponse;
}) {
  const [pipeline, setPipeline] = useState(initialPipeline);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all');
  const [attentionFilter, setAttentionFilter] = useState<
    'all' | 'attention' | 'clear'
  >('all');

  // Filtering is local: the board already holds every card, and a status move
  // refetches the whole board, so filtering here stays correct without another
  // round trip. The status filter chooses which columns render; the other two
  // narrow the cards inside them.
  const term = query.trim().toLowerCase();
  const digits = term.replace(/[^\d+]/g, '');
  const filtersActive =
    term !== '' || statusFilter !== 'all' || attentionFilter !== 'all';

  const visibleColumns = pipeline.columns
    .filter((column) => statusFilter === 'all' || column.status === statusFilter)
    .map((column) => {
      const cards = column.cards.filter((card) => {
        if (attentionFilter === 'attention' && !card.needs_attention) return false;
        if (attentionFilter === 'clear' && card.needs_attention) return false;
        if (term === '') return true;
        if (card.name.toLowerCase().includes(term)) return true;

        // Phone numbers are stored normalised; a number typed with spaces
        // still matches on its digits.
        return digits !== '' && card.phone !== null && card.phone.includes(digits);
      });

      return { ...column, cards, count: cards.length };
    });
  const visibleTotal = visibleColumns.reduce(
    (sum, column) => sum + column.count,
    0,
  );

  function clearFilters() {
    setQuery('');
    setStatusFilter('all');
    setAttentionFilter('all');
  }

  // A capture screen can save an enquiry after this board's payload was
  // rendered or prefetched. Re-read the stored rows on mount and whenever the
  // tab returns, so a new card is never missing from a stale column.
  useEffect(() => {
    let active = true;
    let inFlight = false;

    async function syncLatest() {
      if (inFlight) return;
      inFlight = true;

      try {
        const response = await fetch('/api/pipeline', { cache: 'no-store' });
        if (!response.ok) return;

        const latest = (await response.json()) as PipelineResponse;
        if (active) setPipeline(latest);
      } catch {
        // Keep the server-rendered board. A background sync has no action to
        // retry, and a transient failure must not replace the columns.
      } finally {
        inFlight = false;
      }
    }

    void syncLatest();

    const onFocus = () => void syncLatest();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void syncLatest();
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      active = false;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  async function updateCard(id: string, body: UpdateBody): UpdateResult {
    setBusyId(id);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/enquiries/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        setError(messageFrom(payload, 'Could not update that card.'));
        return false;
      }

      const refreshed = await fetch('/api/pipeline', { cache: 'no-store' });

      if (refreshed.ok) {
        setPipeline((await refreshed.json()) as PipelineResponse);
      } else {
        setError(
          'The card was updated, but the board could not be refreshed. Reload to see it.',
        );
      }

      const updated = payload as { enquiry?: { name?: unknown } };
      const name =
        typeof updated.enquiry?.name === 'string'
          ? updated.enquiry.name
          : 'The card';

      setNotice(`${name} updated.`);
      return true;
    } catch {
      setError(
        'Could not confirm the update. Reload the board and check the card before retrying.',
      );
      return false;
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {notice ? (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        >
          {notice}
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label
            htmlFor="pipeline-search"
            className="flex w-full max-w-sm flex-col gap-1 text-xs font-medium text-slate-700"
          >
            Search the board
            <input
              id="pipeline-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name or phone number"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </label>

          <label
            htmlFor="pipeline-status"
            className="flex flex-col gap-1 text-xs font-medium text-slate-700"
          >
            Status
            <select
              id="pipeline-status"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as 'all' | Status)
              }
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            >
              <option value="all">All statuses</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>

          <label
            htmlFor="pipeline-attention"
            className="flex flex-col gap-1 text-xs font-medium text-slate-700"
          >
            Attention
            <select
              id="pipeline-attention"
              value={attentionFilter}
              onChange={(event) =>
                setAttentionFilter(
                  event.target.value as 'all' | 'attention' | 'clear',
                )
              }
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            >
              <option value="all">Any</option>
              <option value="attention">Needs attention</option>
              <option value="clear">No attention</option>
            </select>
          </label>

          {filtersActive ? (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Clear filters
            </button>
          ) : null}
        </div>

        {filtersActive ? (
          <p className="text-xs text-slate-600">
            {visibleTotal} of {pipeline.total}{' '}
            {pipeline.total === 1 ? 'lead' : 'leads'} shown.
          </p>
        ) : null}
      </div>

      <div className="grid grid-flow-col auto-cols-[minmax(230px,1fr)] gap-4 overflow-x-auto pb-2">
        {visibleColumns.map((column) => (
          <section
            key={column.status}
            aria-labelledby={`column-${column.status}`}
            className="flex min-h-[18rem] flex-col rounded-2xl border border-slate-200 bg-slate-100/80 p-3"
          >
            <header className="flex items-center justify-between gap-2">
              <h2
                id={`column-${column.status}`}
                className="text-sm font-semibold text-slate-800"
              >
                {column.label}
              </h2>
              <span
                aria-label={`${column.count} in ${column.label}`}
                className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200"
              >
                {column.count}
              </span>
            </header>

            <div className="mt-3 flex flex-col gap-3">
              {column.cards.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-500">
                  {filtersActive
                    ? 'No match in this stage.'
                    : 'No leads in this stage.'}
                </p>
              ) : (
                column.cards.map((card) => (
                  <BoardCard
                    key={card.id}
                    card={card}
                    busy={busyId === card.id}
                    onUpdate={updateCard}
                  />
                ))
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function BoardCard({
  card,
  busy,
  onUpdate,
}: {
  card: PipelineCard;
  busy: boolean;
  onUpdate: (id: string, body: UpdateBody) => UpdateResult;
}) {
  const [status, setStatus] = useState<Status>(card.status);
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);

  // A refresh can move this card to a different column; keep the control in
  // step with the card it belongs to.
  useEffect(() => {
    setStatus(card.status);
  }, [card.status]);

  /**
   * One card, one request. `keepDraft` leaves the note box and the open panel
   * alone: the attention flag is a separate act from writing down a call.
   */
  async function submit(
    body: UpdateBody,
    { keepDraft = false }: { keepDraft?: boolean } = {},
  ) {
    const updated = await onUpdate(card.id, body);

    if (updated && !keepDraft) {
      setNote('');
      setOpen(false);
    }
  }

  const moveCard = () => submit({ status, note });
  const saveNoteOnly = () => submit({ note });
  const toggleAttention = () =>
    submit({ needs_attention: !card.needs_attention }, { keepDraft: true });

  return (
    <article
      className={`rounded-xl border border-slate-200 bg-white p-3 shadow-sm ${
        busy ? 'opacity-70' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold leading-snug text-slate-900">
          {card.name}
        </h3>
        {card.needs_attention ? (
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
            Attention
          </span>
        ) : null}
      </div>

      <p className="mt-0.5 text-xs text-slate-600">
        {card.company ?? 'No company'}
      </p>
      <p className="text-xs text-slate-500">{card.job_title ?? 'No role'}</p>
      {card.phone ? (
        <p className="text-xs text-slate-500">{card.phone}</p>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-1">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
          {INTEREST_LABELS[card.interest]}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
          {KIND_LABELS[card.kind]}
        </span>
      </div>

      {card.summary ? (
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-600">
          {card.summary}
        </p>
      ) : null}

      <p className="mt-2 text-[11px] text-slate-500">
        {card.last_contacted_at ? 'Contacted' : 'Created'}{' '}
        {formatAge(card.age_seconds)}
      </p>

      <Link
        href={`/enquiries/${card.id}`}
        className="mt-1 inline-block text-[11px] font-medium text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
      >
        Open enquiry →
      </Link>

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="mt-2 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
      >
        {open ? 'Close' : 'Move or note'}
      </button>

      {open ? (
        <div className="mt-2 flex flex-col gap-2 rounded-lg bg-slate-50 p-2">
          <label className="text-[11px] font-medium text-slate-700">
            New status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as Status)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900"
            >
              {STATUSES.map((option) => (
                <option key={option} value={option}>
                  {STATUS_LABELS[option]}
                </option>
              ))}
            </select>
          </label>

          <label className="text-[11px] font-medium text-slate-700">
            Note
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              placeholder="What was said?"
              className="mt-1 w-full resize-y rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={moveCard}
              disabled={busy || status === card.status}
              className="rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {busy ? 'Saving…' : 'Move card'}
            </button>
            <button
              type="button"
              onClick={saveNoteOnly}
              disabled={busy || note.trim() === ''}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save note only
            </button>
            <button
              type="button"
              onClick={toggleAttention}
              disabled={busy}
              className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {card.needs_attention ? 'Clear attention' : 'Flag attention'}
            </button>
          </div>

          <p className="text-[10px] leading-relaxed text-slate-500">
            Leaving New stamps the contact time and appends the note; a later
            move keeps the contact time it already had. A note or the attention
            flag on its own changes nothing else.
          </p>
        </div>
      ) : null}
    </article>
  );
}

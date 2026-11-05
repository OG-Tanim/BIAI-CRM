'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import type { DuplicateSummary, SaveEnquiryResponse } from '@/lib/api/enquiries';
import type { AiMode } from '@/lib/ai/availability';
import { pendingPlaceholders } from '@/lib/domain/enquiry';
import type {
  Channel,
  Interest,
  Kind,
} from '@/lib/domain/extraction';
import { formatDateTime } from '@/lib/format';
import { messageFrom } from '@/lib/api/error-message';

const CHANNEL_OPTIONS: Array<{ value: Channel; label: string }> = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'website', label: 'Website' },
  { value: 'phone', label: 'Phone call' },
];

const INTEREST_OPTIONS: Array<{ value: Interest; label: string }> = [
  { value: 'bootcamp', label: 'Bootcamp' },
  { value: 'fellowship', label: 'Fellowship' },
  { value: 'corporate', label: 'Corporate training' },
  { value: 'unclear', label: 'Unclear' },
];

const KIND_OPTIONS: Array<{ value: Kind; label: string }> = [
  { value: 'sales_lead', label: 'Sales lead' },
  { value: 'job_seeker', label: 'Job seeker' },
  { value: 'support', label: 'Support' },
  { value: 'spam', label: 'Spam' },
  { value: 'unclear', label: 'Unclear' },
];

type Draft = {
  name: string;
  company: string;
  jobTitle: string;
  phone: string;
  channel: Channel;
  channelHandle: string;
  interest: Interest;
  kind: Kind;
  summary: string;
  reply: string;
  needsAttention: boolean;
};

type ExtractionPayload = {
  name: string;
  company: string | null;
  job_title: string | null;
  phone: string | null;
  channel: Channel;
  channel_handle: string | null;
  interest: Interest;
  kind: Kind;
  summary: string;
  needs_attention: boolean;
};

type Notice = { kind: 'ok' | 'warn' | 'error'; text: string };

type ReplyPayload = {
  reply: string | null;
};

const EMPTY_DRAFT: Draft = {
  name: '',
  company: '',
  jobTitle: '',
  phone: '',
  channel: 'whatsapp',
  channelHandle: '',
  interest: 'bootcamp',
  kind: 'sales_lead',
  summary: '',
  reply: '',
  needsAttention: false,
};

function draftFromExtraction(payload: ExtractionPayload, current: Draft): Draft {
  return {
    name: payload.name,
    company: payload.company ?? '',
    jobTitle: payload.job_title ?? '',
    phone: payload.phone ?? '',
    channel: payload.channel,
    channelHandle: payload.channel_handle ?? '',
    interest: payload.interest,
    kind: payload.kind,
    summary: payload.summary,
    // Read message is extraction only. Whatever is already in the reply box —
    // typed by hand or drafted by Generate reply — survives an extraction.
    reply: current.reply,
    needsAttention: payload.needs_attention,
  };
}

const DRAFT_KEYS = Object.keys(EMPTY_DRAFT) as Array<keyof Draft>;

/** True when the operator has changed any field away from its empty default. */
function hasDraftInput(draft: Draft): boolean {
  return DRAFT_KEYS.some((key) => draft[key] !== EMPTY_DRAFT[key]);
}

export function CaptureForm({ aiMode }: { aiMode: AiMode }) {
  const [rawMessage, setRawMessage] = useState('');
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  // True only when the visible fields came from an extraction. Manual entry
  // never sets it, so the original message stays editable without AI.
  const [hasProposal, setHasProposal] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [writingReply, setWritingReply] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [replyNotice, setReplyNotice] = useState<Notice | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SaveEnquiryResponse | null>(null);
  const [copyNotice, setCopyNotice] = useState<Notice | null>(null);
  const saveInFlight = useRef(false);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const canUseAi = aiMode !== 'unavailable';
  const enteredDetails = hasDraftInput(draft);
  const hasStarted = rawMessage.trim() !== '' || enteredDetails || hasProposal;

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function extract() {
    if (extracting || rawMessage.trim() === '') return;

    // The AI proposal replaces the whole draft, so anything typed by hand
    // would disappear without this explicit confirmation.
    if (
      enteredDetails &&
      !window.confirm(
        'Replace the details you have already entered with the AI proposal?',
      )
    ) {
      return;
    }

    setExtracting(true);
    setExtractError(null);

    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: rawMessage }),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        setExtractError(messageFrom(payload, 'Could not read that message.'));
        return;
      }

      setDraft((current) =>
        draftFromExtraction(payload as ExtractionPayload, current),
      );
      setHasProposal(true);
      setReplyNotice(null);
      setCopyNotice(null);
    } catch {
      setExtractError('Could not reach the extraction service. Try again.');
    } finally {
      setExtracting(false);
    }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // React state is not synchronous: two clicks in the same tick would both
    // get past a `saving` check and insert two rows.
    if (saveInFlight.current) return;
    saveInFlight.current = true;
    setSaving(true);
    setSaveError(null);
    setCopyNotice(null);

    try {
      const response = await fetch('/api/enquiries', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: draft.name,
          company: draft.company,
          job_title: draft.jobTitle,
          phone: draft.phone,
          channel: draft.channel,
          channel_handle: draft.channelHandle,
          interest: draft.interest,
          kind: draft.kind,
          summary: draft.summary,
          suggested_reply: draft.reply,
          // The one reply box is mirrored into both stored reply columns, so
          // the enquiry detail view and any older reader see the same text.
          reply_filled: draft.reply.trim() === '' ? null : draft.reply,
          needs_attention: draft.needsAttention,
          raw_message: rawMessage,
        }),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        setSaveError(messageFrom(payload, 'Could not save the enquiry.'));
        return;
      }

      setSaved(payload as SaveEnquiryResponse);
    } catch {
      setSaveError('Could not reach the server. The enquiry was not saved.');
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }

  async function copyReplyText(text: string) {
    if (text.trim() === '') {
      setCopyNotice({ kind: 'warn', text: 'There is no reply to copy yet.' });
      return;
    }

    const missing = pendingPlaceholders(text);
    const tokens = missing.map((token) => `{{${token}}}`).join(', ');

    if (
      missing.length > 0 &&
      !window.confirm(
        `This reply still contains ${tokens}. Copy it anyway?`,
      )
    ) {
      setCopyNotice({
        kind: 'warn',
        text: `Not copied — fill ${tokens} before sending.`,
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopyNotice(
        missing.length > 0
          ? {
              kind: 'warn',
              text: `Copied, but the reply still contains ${tokens}. Fill them before sending.`,
            }
          : { kind: 'ok', text: 'Copied the reply.' },
      );
    } catch {
      setCopyNotice({
        kind: 'error',
        text: 'Could not access the clipboard. Select the reply and copy it manually.',
      });
    }
  }

  async function generateReply() {
    if (writingReply || !canUseAi) return;

    if (rawMessage.trim() === '') {
      setReplyNotice({
        kind: 'warn',
        text: 'Paste the message in "The message" box first, then generate a reply.',
      });
      messageRef.current?.focus();
      messageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (
      draft.reply.trim() !== '' &&
      !window.confirm(
        'Replace the reply already in the box with a new AI draft?',
      )
    ) {
      return;
    }

    setWritingReply(true);
    setReplyNotice(null);
    setCopyNotice(null);

    try {
      const response = await fetch('/api/reply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: rawMessage }),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        setReplyNotice({
          kind: 'error',
          text: messageFrom(payload, 'Could not generate a reply.'),
        });
        return;
      }

      const result = payload as ReplyPayload;
      const reply = result.reply ?? '';

      setDraft((current) => ({
        ...current,
        reply,
      }));
      setReplyNotice(
        reply.trim() === ''
          ? null
          : {
              kind: 'ok',
              text: 'AI draft added to the reply box. Edit it or fill any placeholders before copying.',
            },
      );
    } catch {
      setReplyNotice({
        kind: 'error',
        text: 'Could not reach the reply service. Try again or write the reply yourself.',
      });
    } finally {
      setWritingReply(false);
    }
  }

  function startAnother() {
    setRawMessage('');
    setDraft(EMPTY_DRAFT);
    setHasProposal(false);
    setExtractError(null);
    setReplyNotice(null);
    setSaveError(null);
    setSaved(null);
    setCopyNotice(null);
  }

  if (saved) {
    const copyText =
      saved.enquiry.reply_filled ?? saved.enquiry.suggested_reply;
    const missing = pendingPlaceholders(copyText);

    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-10">
        <header className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
            BIAI CRM
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Enquiry saved
          </h1>
        </header>

        <section className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-emerald-700">
                Now in{' '}
                {saved.enquiry.status === 'new'
                  ? 'New'
                  : saved.enquiry.status.charAt(0).toUpperCase() +
                    saved.enquiry.status.slice(1)}
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {saved.enquiry.name}
              </p>
              <p className="text-sm text-slate-500">
                {saved.enquiry.phone ?? 'No phone number'}
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {saved.enquiry.kind.replace('_', ' ')} ·{' '}
              {saved.enquiry.interest.replace('_', ' ')}
            </span>
          </div>

          {saved.duplicateOf ? (
            <DuplicateWarning duplicate={saved.duplicateOf} />
          ) : null}

          <div className="mt-6 rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Reply
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
              {copyText === ''
                ? 'No reply was written for this enquiry.'
                : copyText}
            </p>
            {missing.length > 0 ? (
              <p className="mt-3 text-xs font-medium text-amber-700">
                This reply still contains{' '}
                {missing.map((token) => `{{${token}}}`).join(', ')}. Copying
                asks for confirmation until it is filled.
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => copyReplyText(copyText)}
              className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Copy reply
            </button>
            {copyNotice ? (
              <p
                role="status"
                className={`mt-3 rounded-lg px-3 py-2 text-sm ${
                  copyNotice.kind === 'ok'
                    ? 'bg-emerald-50 text-emerald-800'
                    : copyNotice.kind === 'warn'
                      ? 'bg-amber-50 text-amber-900'
                      : 'bg-red-50 text-red-800'
                }`}
              >
                {copyNotice.text}
              </p>
            ) : null}
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/pipeline"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Go to pipeline
          </Link>
          <button
            type="button"
            onClick={startAnother}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Capture another enquiry
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
          BIAI CRM
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Capture an enquiry
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-600">
          Paste the message as it arrived, then type the details yourself or
          let the AI propose them. Read message fills the enquiry details;
          Generate reply drafts only the reply. The original message is kept
          exactly as pasted.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <label
          htmlFor="raw-message"
          className="text-sm font-semibold text-slate-900"
        >
          1. The message
        </label>
        <textarea
          id="raw-message"
          ref={messageRef}
          value={rawMessage}
          onChange={(event) => setRawMessage(event.target.value)}
          readOnly={extracting || writingReply || hasProposal}
          rows={6}
          placeholder="Paste a WhatsApp message, a Facebook DM, a website enquiry or phone-call notes…"
          className="mt-3 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 read-only:bg-slate-50"
        />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={extract}
            disabled={
              extracting || writingReply || rawMessage.trim() === '' || !canUseAi
            }
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {extracting
              ? 'Reading…'
              : canUseAi
                ? hasProposal
                  ? 'Read message again'
                  : 'Read message'
                : 'AI extraction is off'}
          </button>
          {hasStarted ? (
            <button
              type="button"
              onClick={startAnother}
              disabled={extracting || writingReply || saving}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Start over
            </button>
          ) : null}
          <span className="text-xs text-slate-500">
            {hasProposal
              ? 'The original message is locked while you review the AI proposal. Start over to edit it.'
              : 'AI is optional — the details below can be typed in directly.'}
          </span>
        </div>

        {!canUseAi ? (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            AI extraction is unavailable, so the Read message button is off.
            Enter the details below yourself — every field is editable and
            saving works as usual.
          </p>
        ) : null}

        {hasProposal ? (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            The AI proposal is in the details below. Check every value before
            saving.
          </p>
        ) : null}

        {extractError ? (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {extractError}
          </p>
        ) : null}
      </section>

      <form
        onSubmit={save}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <fieldset
          disabled={extracting || writingReply}
          aria-label="Enquiry details"
          className="m-0 flex w-full min-w-0 flex-col gap-6 border-0 p-0"
        >
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {hasProposal ? '2. Review the proposal' : '2. The details'}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {hasProposal
                ? 'Everything here is editable except status — a saved enquiry always starts in New.'
                : 'Type these in yourself, or use Read message above to let the AI propose them. Everything is editable and a saved enquiry always starts in New.'}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="name" required>
              <input
                id="name"
                value={draft.name}
                onChange={(event) => update('name', event.target.value)}
                required
                className={inputClass}
              />
            </Field>

            <Field label="Phone" htmlFor="phone" hint="Formatting is normalised.">
              <input
                id="phone"
                value={draft.phone}
                onChange={(event) => update('phone', event.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Company" htmlFor="company">
              <input
                id="company"
                value={draft.company}
                onChange={(event) => update('company', event.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Job title" htmlFor="job-title">
              <input
                id="job-title"
                value={draft.jobTitle}
                onChange={(event) => update('jobTitle', event.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Channel" htmlFor="channel">
              <select
                id="channel"
                value={draft.channel}
                onChange={(event) =>
                  update('channel', event.target.value as Channel)
                }
                className={inputClass}
              >
                {CHANNEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Channel handle" htmlFor="channel-handle">
              <input
                id="channel-handle"
                value={draft.channelHandle}
                onChange={(event) => update('channelHandle', event.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Interest" htmlFor="interest">
              <select
                id="interest"
                value={draft.interest}
                onChange={(event) =>
                  update('interest', event.target.value as Interest)
                }
                className={inputClass}
              >
                {INTEREST_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Kind" htmlFor="kind">
              <select
                id="kind"
                value={draft.kind}
                onChange={(event) => update('kind', event.target.value as Kind)}
                className={inputClass}
              >
                {KIND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Summary" htmlFor="summary">
            <textarea
              id="summary"
              value={draft.summary}
              onChange={(event) => update('summary', event.target.value)}
              rows={2}
              className={inputClass}
            />
          </Field>

          <label className="flex items-center gap-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={draft.needsAttention}
              onChange={(event) =>
                update('needsAttention', event.target.checked)
              }
              className="h-4 w-4 rounded border-slate-300"
            />
            Needs attention
          </label>

          <div className="flex flex-col gap-4 rounded-xl bg-slate-50 p-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Reply</p>
              <p className="text-xs text-slate-600">
                One editable reply. Copy it whenever you need; unfilled
                placeholders ask before they leave this screen.
              </p>
            </div>

            <Field
              label="Reply"
              htmlFor="reply"
              hint="AI drafts keep placeholders. Edit them here when you know the answers."
            >
              <textarea
                id="reply"
                value={draft.reply}
                onChange={(event) => update('reply', event.target.value)}
                readOnly={writingReply}
                rows={5}
                placeholder="Write a reply, or generate one from the message."
                className={inputClass}
              />
            </Field>

            {pendingPlaceholders(draft.reply).length > 0 ? (
              <p className="text-xs font-medium text-amber-700">
                Needs filling:{' '}
                {pendingPlaceholders(draft.reply)
                  .map((token) => `{{${token}}}`)
                  .join(', ')}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={generateReply}
                disabled={writingReply || !canUseAi}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {writingReply
                  ? 'Writing…'
                  : canUseAi
                    ? 'Generate reply'
                    : 'AI reply is off'}
              </button>
              <button
                type="button"
                onClick={() => copyReplyText(draft.reply)}
                disabled={writingReply}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Copy reply
              </button>
            </div>

            {replyNotice ? (
              <p
                role="status"
                className={`rounded-lg px-3 py-2 text-sm ${
                  replyNotice.kind === 'ok'
                    ? 'bg-emerald-50 text-emerald-800'
                    : replyNotice.kind === 'warn'
                      ? 'bg-amber-50 text-amber-900'
                      : 'bg-red-50 text-red-800'
                }`}
              >
                {replyNotice.text}
              </p>
            ) : null}

            {copyNotice ? (
              <p
                role="status"
                className={`rounded-lg px-3 py-2 text-sm ${
                  copyNotice.kind === 'ok'
                    ? 'bg-emerald-50 text-emerald-800'
                    : copyNotice.kind === 'warn'
                      ? 'bg-amber-50 text-amber-900'
                      : 'bg-red-50 text-red-800'
                }`}
              >
                {copyNotice.text}
              </p>
            ) : null}
          </div>

          {saveError ? (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              {saveError}
            </p>
          ) : null}

          {rawMessage.trim() === '' ? (
            <p className="text-xs font-medium text-amber-700">
              The original message cannot be empty. Paste it in step 1 before
              saving.
            </p>
          ) : null}

          <button
            type="submit"
            disabled={
              saving ||
              writingReply ||
              draft.name.trim() === '' ||
              rawMessage.trim() === ''
            }
            className="self-start rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {saving ? 'Saving…' : 'Save enquiry'}
          </button>
        </fieldset>
      </form>
    </main>
  );
}

function DuplicateWarning({ duplicate }: { duplicate: DuplicateSummary }) {
  return (
    <div
      role="status"
      className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
    >
      <p className="font-semibold">This phone number is already on file.</p>
      <p className="mt-1">
        The earlier enquiry belongs to{' '}
        <span className="font-medium">{duplicate.name}</span> (status{' '}
        {duplicate.status.replace('_', ' ')}, saved{' '}
        {formatDateTime(duplicate.created_at)}). This new enquiry was still
        saved.
      </p>
    </div>
  );
}

const inputClass =
  'mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200';

function Field({
  label,
  htmlFor,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-xs font-medium text-slate-700">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </label>
      {children}
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

'use client';

import { useRef, useState } from 'react';
import type { EnquiryDto } from '@/lib/api/enquiry-dto';
import type { DuplicateSummary, SaveEnquiryResponse } from '@/lib/api/enquiries';
import {
  UnfilledPlaceholderError,
  pendingPlaceholders,
  replyToCopy,
} from '@/lib/domain/enquiry';
import type {
  Channel,
  Interest,
  Kind,
  ReplyLanguage,
} from '@/lib/domain/extraction';

const CHANNEL_OPTIONS: Array<{ value: Channel; label: string }> = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'website', label: 'Website' },
  { value: 'email', label: 'Email' },
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

const LANGUAGE_OPTIONS: Array<{ value: ReplyLanguage; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'banglish', label: 'Banglish' },
  { value: 'bn', label: 'বাংলা (Bengali)' },
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
  suggestedReply: string;
  replyFilled: string;
  replyLanguage: ReplyLanguage;
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
  suggested_reply: string | null;
  reply_language: ReplyLanguage;
  needs_attention: boolean;
};

type Notice = { kind: 'ok' | 'warn' | 'error'; text: string };

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
  suggestedReply: '',
  replyFilled: '',
  replyLanguage: 'en',
  needsAttention: false,
};

function draftFromExtraction(payload: ExtractionPayload): Draft {
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
    suggestedReply: payload.suggested_reply ?? '',
    replyFilled: '',
    replyLanguage: payload.reply_language,
    needsAttention: payload.needs_attention,
  };
}

function errorMessage(payload: unknown, fallback: string): string {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    typeof (payload as { message?: unknown }).message === 'string'
  ) {
    const issues = (payload as { issues?: unknown }).issues;
    const detail =
      Array.isArray(issues) && issues.length > 0 ? ` ${issues.join('; ')}` : '';
    return `${(payload as { message: string }).message}${detail}`;
  }
  return fallback;
}

export function CaptureForm() {
  const [rawMessage, setRawMessage] = useState('');
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [hasProposal, setHasProposal] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SaveEnquiryResponse | null>(null);
  const [copyNotice, setCopyNotice] = useState<Notice | null>(null);
  const saveInFlight = useRef(false);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function extract() {
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
        setExtractError(errorMessage(payload, 'Could not read that message.'));
        return;
      }

      setDraft(draftFromExtraction(payload as ExtractionPayload));
      setHasProposal(true);
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
          suggested_reply: draft.suggestedReply,
          reply_filled: draft.replyFilled,
          reply_language: draft.replyLanguage,
          needs_attention: draft.needsAttention,
          raw_message: rawMessage,
        }),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        setSaveError(errorMessage(payload, 'Could not save the enquiry.'));
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

  async function copyReply(enquiry: EnquiryDto) {
    try {
      const text = replyToCopy({
        suggestedReply: enquiry.suggested_reply,
        replyFilled: enquiry.reply_filled,
      });

      if (text.trim() === '') {
        setCopyNotice({ kind: 'warn', text: 'This enquiry has no reply to copy yet.' });
        return;
      }

      await navigator.clipboard.writeText(text);
      setCopyNotice({ kind: 'ok', text: 'Copied the filled reply.' });
    } catch (error) {
      if (error instanceof UnfilledPlaceholderError) {
        const tokens = error.placeholders.map((token) => `{{${token}}}`).join(', ');
        setCopyNotice({
          kind: 'warn',
          text: tokens
            ? `Not copied — the reply still contains ${tokens}. Fill the template first.`
            : 'Not copied — the reply still contains an unfilled placeholder.',
        });
        return;
      }

      setCopyNotice({
        kind: 'error',
        text: 'Could not access the clipboard. Select the reply and copy it manually.',
      });
    }
  }

  function startAnother() {
    setRawMessage('');
    setDraft(EMPTY_DRAFT);
    setHasProposal(false);
    setExtractError(null);
    setSaveError(null);
    setSaved(null);
    setCopyNotice(null);
  }

  if (saved) {
    const copyText =
      saved.enquiry.reply_filled ?? saved.enquiry.suggested_reply;
    const missing = pendingPlaceholders(copyText);
    const templateKept =
      saved.enquiry.suggested_reply !== '' &&
      saved.enquiry.suggested_reply !== saved.enquiry.reply_filled;

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
              <p className="text-sm font-medium text-emerald-700">Now in New</p>
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
              Filled reply — what gets copied
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
                will warn until it is filled.
              </p>
            ) : null}
            {templateKept ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium text-slate-600">
                  Template kept
                </summary>
                <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
                  {saved.enquiry.suggested_reply}
                </p>
              </details>
            ) : null}
            <button
              type="button"
              onClick={() => copyReply(saved.enquiry)}
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

        <button
          type="button"
          onClick={startAnother}
          className="self-start rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Capture another enquiry
        </button>
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
          Paste the message as it arrived. Review what the AI proposes, correct
          anything wrong, then save. The original message is kept exactly as
          pasted.
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
          value={rawMessage}
          onChange={(event) => setRawMessage(event.target.value)}
          readOnly={hasProposal}
          rows={6}
          placeholder="Paste a WhatsApp message, a Facebook DM, a website enquiry or phone-call notes…"
          className="mt-3 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 read-only:bg-slate-50"
        />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {!hasProposal ? (
            <button
              type="button"
              onClick={extract}
              disabled={extracting || rawMessage.trim() === ''}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {extracting ? 'Reading…' : 'Read message'}
            </button>
          ) : (
            <button
              type="button"
              onClick={startAnother}
              disabled={saving}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Start over
            </button>
          )}
          {hasProposal ? (
            <span className="text-xs text-slate-500">
              The original message is locked while you review the proposal.
            </span>
          ) : null}
        </div>

        {extractError ? (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {extractError}
          </p>
        ) : null}
      </section>

      {hasProposal ? (
        <form
          onSubmit={save}
          className="flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div>
            <p className="text-sm font-semibold text-slate-900">
              2. Review the proposal
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Everything here is editable except status — a saved enquiry
              always starts in New.
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Reply</p>
                <p className="text-xs text-slate-600">
                  The template keeps its placeholders. The filled version is
                  stored separately and is what gets copied.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                Language
                <select
                  value={draft.replyLanguage}
                  onChange={(event) =>
                    update(
                      'replyLanguage',
                      event.target.value as ReplyLanguage,
                    )
                  }
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
                >
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <Field
              label="Reply template"
              htmlFor="suggested-reply"
              hint="Placeholders are allowed here."
            >
              <textarea
                id="suggested-reply"
                value={draft.suggestedReply}
                onChange={(event) => update('suggestedReply', event.target.value)}
                rows={4}
                className={inputClass}
              />
            </Field>

            {pendingPlaceholders(draft.suggestedReply).length > 0 ? (
              <p className="text-xs font-medium text-amber-700">
                Needs filling:{' '}
                {pendingPlaceholders(draft.suggestedReply)
                  .map((token) => `{{${token}}}`)
                  .join(', ')}
              </p>
            ) : null}

            <Field
              label="Filled reply"
              htmlFor="reply-filled"
              hint="What the operator copies. Leave blank if the template has no placeholders."
            >
              <textarea
                id="reply-filled"
                value={draft.replyFilled}
                onChange={(event) => update('replyFilled', event.target.value)}
                rows={4}
                className={inputClass}
              />
            </Field>

            <button
              type="button"
              onClick={() => update('replyFilled', draft.suggestedReply)}
              disabled={draft.suggestedReply.trim() === ''}
              className="self-start rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Start from the template
            </button>
          </div>

          {saveError ? (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              {saveError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={saving || draft.name.trim() === ''}
            className="self-start rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {saving ? 'Saving…' : 'Save enquiry'}
          </button>
        </form>
      ) : null}
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
        {new Date(duplicate.created_at).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}
        ). This new enquiry was still saved.
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

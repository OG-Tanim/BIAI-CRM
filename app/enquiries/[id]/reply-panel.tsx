'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { EnquiryDto } from '@/lib/api/enquiry-dto';
import { messageFrom } from '@/lib/api/error-message';
import {
  UnfilledPlaceholderError,
  pendingPlaceholders,
  replyToCopy,
} from '@/lib/domain/enquiry';

type Notice = { kind: 'ok' | 'warn' | 'error'; text: string };

/**
 * The reply after save.
 *
 * The capture screen owns the first draft, but a template often gets filled
 * once the operator knows the price or the start date. That edit belongs to the
 * enquiry, not to a transient form, so the template and the finished text are
 * saved here through the same PATCH the board uses.
 */
export function ReplyPanel({ enquiry }: { enquiry: EnquiryDto }) {
  const router = useRouter();
  const [template, setTemplate] = useState(enquiry.suggested_reply);
  const [filled, setFilled] = useState(enquiry.reply_filled ?? '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const copyText = filled.trim() === '' ? template : filled;
  const missing = pendingPlaceholders(copyText);
  const dirty =
    template !== enquiry.suggested_reply ||
    filled !== (enquiry.reply_filled ?? '');

  async function save() {
    setBusy(true);
    setNotice(null);

    try {
      const response = await fetch(`/api/enquiries/${enquiry.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          suggested_reply: template,
          reply_filled: filled.trim() === '' ? null : filled,
        }),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        setNotice({
          kind: 'error',
          text: messageFrom(payload, 'Could not save the reply.'),
        });
        return;
      }

      const updated = (payload as { enquiry: EnquiryDto }).enquiry;
      setTemplate(updated.suggested_reply);
      setFilled(updated.reply_filled ?? '');
      setNotice({ kind: 'ok', text: 'Reply saved to this enquiry.' });
      router.refresh();
    } catch {
      setNotice({
        kind: 'error',
        text: 'Could not confirm the save. Reload and check the reply before retrying.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      const text = replyToCopy({
        suggestedReply: template,
        replyFilled: filled.trim() === '' ? null : filled,
      });

      await navigator.clipboard.writeText(text);
      setNotice({ kind: 'ok', text: 'Copied the filled reply.' });
    } catch (error) {
      if (error instanceof UnfilledPlaceholderError) {
        setNotice({
          kind: 'warn',
          text:
            error.placeholders.length > 0
              ? `Not copied — fill ${error.placeholders
                  .map((token) => `{{${token}}}`)
                  .join(', ')} first.`
              : 'Not copied — the reply still contains an unfilled placeholder.',
        });
        return;
      }

      setNotice({ kind: 'error', text: 'Could not reach the clipboard.' });
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Reply</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600">
            The template keeps its placeholders; the filled version is what gets
            copied. Both are stored on the enquiry, so the reply actually sent
            is on record after the tab closes.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
          {enquiry.reply_language === 'bn'
            ? 'বাংলা'
            : enquiry.reply_language === 'banglish'
              ? 'Banglish'
              : 'English'}
        </span>
      </div>

      <label
        htmlFor="reply-template"
        className="mt-4 block text-xs font-medium text-slate-700"
      >
        Reply template
      </label>
      <textarea
        id="reply-template"
        value={template}
        onChange={(event) => setTemplate(event.target.value)}
        rows={4}
        className="mt-1 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
      />

      <label
        htmlFor="reply-filled"
        className="mt-4 block text-xs font-medium text-slate-700"
      >
        Filled reply — what gets copied
      </label>
      <textarea
        id="reply-filled"
        value={filled}
        onChange={(event) => setFilled(event.target.value)}
        rows={4}
        placeholder="Fill the placeholders here once you know the answers."
        className="mt-1 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
      />

      {missing.length > 0 ? (
        <p className="mt-2 text-xs font-medium text-amber-700">
          Needs filling: {missing.map((token) => `{{${token}}}`).join(', ')}.
          Copying warns until it is filled.
        </p>
      ) : (
        <p className="mt-2 text-xs text-slate-500">
          Every placeholder is filled — this is what the customer would receive.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy || !dirty}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {busy ? 'Saving…' : 'Save reply'}
        </button>
        <button
          type="button"
          onClick={copy}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Copy reply
        </button>
      </div>

      {notice ? (
        <p
          role="status"
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            notice.kind === 'ok'
              ? 'bg-emerald-50 text-emerald-800'
              : notice.kind === 'warn'
                ? 'bg-amber-50 text-amber-900'
                : 'bg-red-50 text-red-800'
          }`}
        >
          {notice.text}
        </p>
      ) : null}
    </section>
  );
}

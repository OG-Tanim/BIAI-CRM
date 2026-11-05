'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { AiMode } from '@/lib/ai/availability';
import type { EnquiryDto } from '@/lib/api/enquiry-dto';
import { messageFrom } from '@/lib/api/error-message';
import { pendingPlaceholders } from '@/lib/domain/enquiry';

type Notice = { kind: 'ok' | 'warn' | 'error'; text: string };

/**
 * The reply after save.
 *
 * The capture screen owns the first draft, but the reply often changes once the
 * operator knows the price or the start date. That edit belongs to the enquiry,
 * not to a transient form, so the single reply box is saved here through the
 * same PATCH the board uses.
 *
 * Generate reply works from the original message this enquiry was created
 * from, so the operator can redraft from the page where they can read the
 * whole enquiry.
 */
export function ReplyPanel({
  enquiry,
  aiMode,
}: {
  enquiry: EnquiryDto;
  aiMode: AiMode;
}) {
  const router = useRouter();
  const initialReply = enquiry.reply_filled ?? enquiry.suggested_reply;
  const [reply, setReply] = useState(initialReply);
  const [baseline, setBaseline] = useState(initialReply);
  const [busy, setBusy] = useState(false);
  const [writing, setWriting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const canUseAi = aiMode !== 'unavailable';
  const missing = pendingPlaceholders(reply);
  const dirty = reply !== baseline;

  async function save() {
    setBusy(true);
    setNotice(null);

    try {
      const response = await fetch(`/api/enquiries/${enquiry.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        // The one box is mirrored into both stored reply columns, so older
        // readers and this panel always show the same text.
        body: JSON.stringify({
          suggested_reply: reply,
          reply_filled: reply.trim() === '' ? null : reply,
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
      const savedReply =
        updated.reply_filled ?? updated.suggested_reply;
      setReply(savedReply);
      setBaseline(savedReply);
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

  async function generate() {
    if (writing || !canUseAi) return;

    if (
      reply.trim() !== '' &&
      !window.confirm('Replace the reply already in the box with a new AI draft?')
    ) {
      return;
    }

    setWriting(true);
    setNotice(null);

    try {
      const response = await fetch('/api/reply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // The original message is the question this enquiry is about.
        body: JSON.stringify({ message: enquiry.raw_message }),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        setNotice({
          kind: 'error',
          text: messageFrom(payload, 'Could not generate a reply.'),
        });
        return;
      }

      const next = (payload as { reply: string | null }).reply ?? '';
      setReply(next);
      setNotice(
        next.trim() === ''
          ? { kind: 'warn', text: 'The model returned no reply. Write one by hand.' }
          : {
              kind: 'ok',
              text: 'AI draft added. Edit it, fill any placeholders, then save it to this enquiry.',
            },
      );
    } catch {
      setNotice({
        kind: 'error',
        text: 'Could not reach the reply service. Try again or write the reply yourself.',
      });
    } finally {
      setWriting(false);
    }
  }

  async function copy() {
    if (reply.trim() === '') {
      setNotice({ kind: 'warn', text: 'There is no reply to copy yet.' });
      return;
    }

    const tokens = missing.map((token) => `{{${token}}}`).join(', ');

    if (
      missing.length > 0 &&
      !window.confirm(`This reply still contains ${tokens}. Copy it anyway?`)
    ) {
      setNotice({
        kind: 'warn',
        text: `Not copied — fill ${tokens} before sending.`,
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(reply);
      setNotice(
        missing.length > 0
          ? {
              kind: 'warn',
              text: `Copied, but the reply still contains ${tokens}. Fill them before sending.`,
            }
          : { kind: 'ok', text: 'Copied the reply.' },
      );
    } catch {
      setNotice({ kind: 'error', text: 'Could not reach the clipboard.' });
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Reply</h2>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600">
          One reply, stored on the enquiry, so the text actually sent is on
          record after the tab closes. Generate reply drafts it from the
          original message; placeholders ask before they are copied.
        </p>
      </div>

      <label
        htmlFor="reply"
        className="mt-4 block text-xs font-medium text-slate-700"
      >
        Reply
      </label>
      <textarea
        id="reply"
        value={reply}
        onChange={(event) => setReply(event.target.value)}
        readOnly={writing}
        rows={6}
        placeholder="Write the reply here, or generate one from the original message."
        className="mt-1 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
      />

      {missing.length > 0 ? (
        <p className="mt-2 text-xs font-medium text-amber-700">
          Needs filling: {missing.map((token) => `{{${token}}}`).join(', ')}.
          Copying asks for confirmation until it is filled.
        </p>
      ) : (
        <p className="mt-2 text-xs text-slate-500">
          Every placeholder is filled — this is what the customer would receive.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={generate}
          disabled={writing || !canUseAi}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {writing
            ? 'Writing…'
            : canUseAi
              ? 'Generate reply'
              : 'AI reply is off'}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy || writing || !dirty}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save reply'}
        </button>
        <button
          type="button"
          onClick={copy}
          disabled={writing}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
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

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { messageFrom } from '@/lib/api/error-message';

/**
 * Delete one enquiry from the list.
 *
 * The confirmation names the person: a table row is a thin thing to destroy a
 * record from, and the notes go with it. Nothing about a delete is recoverable,
 * so the button stays quiet until it is used.
 */
export function DeleteEnquiryButton({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (busy) return;

    if (
      !window.confirm(
        `Delete ${name}'s enquiry and every note on it? This cannot be undone.`,
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/enquiries/${id}`, { method: 'DELETE' });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setError(messageFrom(payload, 'Could not delete the enquiry.'));
        return;
      }

      // The list is server-rendered, so a refresh is what removes the row.
      router.refresh();
    } catch {
      setError('Could not reach the server. The enquiry was not deleted.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        className="font-medium text-red-700 underline-offset-2 hover:text-red-900 hover:underline disabled:cursor-not-allowed disabled:text-slate-400"
      >
        {busy ? 'Deleting…' : 'Delete'}
      </button>
      {error ? (
        <span role="alert" className="text-[11px] font-normal text-red-700">
          {error}
        </span>
      ) : null}
    </span>
  );
}

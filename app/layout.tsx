import type { Metadata } from 'next';
import Link from 'next/link';
import { resolveAiMode } from '@/lib/ai/availability';
import './globals.css';

// The AI banner is a fact about this process, not about the build. Render the
// shell per request so a deployment without a key cannot serve a stale
// "AI is ready" page from the build cache.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'BIAI CRM',
  description: 'Enquiry capture and pipeline for BIAI.',
};

const NAV_LINKS = [
  { href: '/', label: 'Capture' },
  { href: '/pipeline', label: 'Pipeline' },
  { href: '/follow-ups', label: 'Follow-ups' },
  { href: '/enquiries', label: 'List' },
  { href: '/summary', label: 'Summary' },
];

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const aiMode = resolveAiMode();

  return (
    <html lang="en">
      {/*
        Browser extensions mutate <body> before hydration (ColorZilla adds
        cz-shortcut-listen, password managers and grammar checkers add their
        own data-* attributes). React compares the server HTML with the client
        props and reports every extra attribute as a hydration mismatch, which
        is noise: the markup we shipped is correct and the attribute is not
        ours. suppressHydrationWarning silences that comparison for this one
        element's attributes only, so real mismatches in the tree below still
        surface.
      */}
      <body
        className="min-h-screen bg-slate-50 text-slate-900 antialiased"
        suppressHydrationWarning
      >
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-3">
            <Link
              href="/"
              className="text-sm font-semibold tracking-tight text-slate-900"
            >
              BIAI CRM
            </Link>
            <nav aria-label="Main" className="flex items-center gap-1 text-sm">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-lg px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        {aiMode === 'mock' ? (
          <div
            role="status"
            aria-label="AI status"
            className="border-b border-sky-200 bg-sky-50"
          >
            <div className="mx-auto max-w-7xl px-6 py-3 text-sm leading-relaxed text-sky-950">
              <p>
                <span className="font-semibold">AI is in mock mode.</span>{' '}
                MOCK_AI=1, so extraction and the written summary are canned
                sample responses keyed to the demo messages. No request reaches
                OpenRouter, and none of the AI text here was written for this
                message.
              </p>
            </div>
          </div>
        ) : null}
        {aiMode === 'unavailable' ? (
          <div
            role="status"
            aria-label="AI status"
            className="border-b border-amber-200 bg-amber-50"
          >
            <div className="mx-auto max-w-7xl px-6 py-3 text-sm leading-relaxed text-amber-950">
              <p>
                <span className="font-semibold">AI is unavailable.</span>{' '}
                OpenRouter is not configured (a key and a model are both
                required), so message extraction and the written summary are
                switched off.
              </p>
              <p className="mt-1 text-amber-900">
                The CRM still works: on Capture, Read message and Generate
                reply are off, but you can type every detail — including the
                reply — in by hand. Saving, the pipeline, follow-ups and the
                list read and write the database as usual.
              </p>
            </div>
          </div>
        ) : null}
        {children}
      </body>
    </html>
  );
}

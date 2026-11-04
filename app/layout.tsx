import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'BIAI CRM',
  description: 'Enquiry capture and pipeline for BIAI.',
};

const NAV_LINKS = [
  { href: '/', label: 'Capture' },
  { href: '/pipeline', label: 'Pipeline' },
  { href: '/enquiries', label: 'List' },
];

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
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
        {children}
      </body>
    </html>
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6">
      <p className="text-sm font-medium uppercase tracking-widest text-slate-500">
        BIAI CRM
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">
        Foundation is running.
      </h1>
      <p className="text-slate-600">
        No feature screens exist yet. The environment is ready for the next
        session.
      </p>
      <p className="text-sm text-slate-500">
        Connection and schema status:{' '}
        <a className="underline" href="/api/health">
          /api/health
        </a>
      </p>
    </main>
  );
}

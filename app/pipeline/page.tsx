import Link from 'next/link';
import { PageLoadError } from '@/app/_components/page-load-error';
import { getDb } from '@/lib/db/client';
import { loadPipeline, type PipelineResponse } from '@/lib/api/pipeline';
import { loadPageData } from '@/lib/api/page-load';
import { PipelineBoard } from './pipeline-board';

export const dynamic = 'force-dynamic';

const LOAD_FAILURE =
  'Could not load the pipeline. Check the database connection and reload.';

export default async function PipelinePage() {
  const { data: pipeline, error } = await loadPageData<PipelineResponse>(
    { label: 'pipeline page', action: 'load', failure: LOAD_FAILURE },
    () => loadPipeline(getDb()),
  );

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-7xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
            Pipeline
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Sales board
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">
            Only genuine sales leads appear here. Spam, job seekers, support
            enquiries and unclear messages are captured in the list instead.
          </p>
        </div>
        {pipeline ? (
          <p className="text-sm text-slate-600">
            <span className="font-semibold text-slate-900">
              {pipeline.total}
            </span>{' '}
            {pipeline.total === 1 ? 'lead' : 'leads'} on the board
          </p>
        ) : null}
      </header>

      {pipeline ? (
        pipeline.total === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
            <p className="text-sm font-semibold text-slate-800">
              No sales leads on the board yet.
            </p>
            <p className="mx-auto mt-1 max-w-xl text-sm leading-relaxed text-slate-600">
              The board only shows genuine sales leads. Spam, job seekers,
              support threads and unclear messages are kept in the list. A
              captured enquiry starts in New and appears here as soon as it is
              saved as a sales lead.
            </p>
            <Link
              href="/"
              className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Capture an enquiry
            </Link>
          </div>
        ) : (
          <PipelineBoard initialPipeline={pipeline} />
        )
      ) : (
        <PageLoadError message={error ?? LOAD_FAILURE} />
      )}
    </main>
  );
}

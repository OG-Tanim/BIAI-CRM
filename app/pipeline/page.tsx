import { getDb } from '@/lib/db/client';
import { loadPipeline, type PipelineResponse } from '@/lib/api/pipeline';
import { PipelineBoard } from './pipeline-board';

export const dynamic = 'force-dynamic';

export default async function PipelinePage() {
  let pipeline: PipelineResponse | null = null;

  try {
    pipeline = await loadPipeline(getDb());
  } catch (error) {
    console.error(
      '[pipeline page] load failed:',
      error instanceof Error ? error.message : 'unknown error',
    );
  }

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
        <PipelineBoard initialPipeline={pipeline} />
      ) : (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          Could not load the pipeline. Check the database connection and reload.
        </p>
      )}
    </main>
  );
}

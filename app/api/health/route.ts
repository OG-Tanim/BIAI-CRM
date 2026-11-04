import { NextResponse } from 'next/server';
import { getDatabaseBranch, getSql } from '@/lib/db/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Counts = {
  enquiries: number;
  notes: number;
};

/**
 * Liveness plus a schema/connection check. The branch is reported explicitly
 * so a deployment can never be mistaken for the wrong Neon branch.
 */
export async function GET() {
  const branch = getDatabaseBranch();

  try {
    const rows = await getSql()<Counts[]>`
      select
        (select count(*)::int from enquiries) as enquiries,
        (select count(*)::int from notes) as notes
    `;

    return NextResponse.json(
      {
        ok: true,
        db: branch,
        tables: {
          enquiries: rows[0]?.enquiries ?? 0,
          notes: rows[0]?.notes ?? 0,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error(
      '[health] database check failed:',
      error instanceof Error ? error.message : 'unknown error',
    );

    return NextResponse.json(
      { ok: false, db: branch, error: 'database_unreachable' },
      { status: 503 },
    );
  }
}

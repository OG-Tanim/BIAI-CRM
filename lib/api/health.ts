import { NextResponse } from 'next/server';
import { getDatabaseBranch, getSql } from '@/lib/db/client';
import { logFailure } from '@/lib/log';

/**
 * Liveness plus a schema/connection check.
 *
 * The database access sits behind this port for the same reason every other
 * handler's does: the route stays a one-line binding, and the check can be
 * exercised without a live branch.
 */

export type HealthCounts = {
  enquiries: number;
  notes: number;
};

export type HealthStore = {
  branch(): string;
  countRows(): Promise<HealthCounts>;
};

export function defaultHealthStore(): HealthStore {
  return {
    branch: () => getDatabaseBranch(),
    async countRows(): Promise<HealthCounts> {
      const rows = await getSql()<HealthCounts[]>`
        select
          (select count(*)::int from enquiries) as enquiries,
          (select count(*)::int from notes) as notes
      `;

      return {
        enquiries: rows[0]?.enquiries ?? 0,
        notes: rows[0]?.notes ?? 0,
      };
    },
  };
}

export function createHealthHandler(
  store: HealthStore = defaultHealthStore(),
) {
  return async function GET(): Promise<NextResponse> {
    const db = store.branch();

    try {
      const tables = await store.countRows();

      return NextResponse.json(
        { ok: true, db, tables },
        { status: 200 },
      );
    } catch (error) {
      logFailure('health', 'database check', error);

      return NextResponse.json(
        { ok: false, db, error: 'database_unreachable' },
        { status: 503 },
      );
    }
  };
}

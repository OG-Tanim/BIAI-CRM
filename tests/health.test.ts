import { describe, expect, it } from 'vitest';
import { inferDatabaseBranch } from '@/lib/db/branch';

describe('database branch selection', () => {
  it('reports the testing branch when it is configured', () => {
    expect(inferDatabaseBranch({ DATABASE_BRANCH: 'testing' })).toBe('testing');
  });
});

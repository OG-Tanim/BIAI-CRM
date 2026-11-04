import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { TransactionRollbackError } from 'drizzle-orm/errors';
import postgres from 'postgres';
import { createEnquiriesHandler } from '@/lib/api/enquiries';
import { enquiries } from '@/lib/db/schema';
import * as schema from '@/lib/db/schema';

/**
 * Seam 2: the HTTP route against a real Postgres database.
 *
 * These tests are deliberately about the wiring a pure-function suite cannot
 * see: that the endpoint inserts one row, forces New, and reports an earlier
 * enquiry when a phone number repeats. Every test runs inside a transaction
 * that is rolled back, so the testing branch is left exactly as it was found —
 * including any demo data a later session has seeded.
 *
 * The connection always comes from TEST_DATABASE_URL.
 */

for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) loadEnvFile(file);
}

const url = process.env.TEST_DATABASE_URL;

if (!url) {
  throw new Error(
    'TEST_DATABASE_URL is not set. Route tests need the throwaway testing branch.',
  );
}

if (process.env.DATABASE_URL && process.env.DATABASE_URL === url) {
  throw new Error(
    'DATABASE_URL and TEST_DATABASE_URL are identical. Refusing to run route tests.',
  );
}

const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 10 });
const db = drizzle(sql, { schema });

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type App = {
  save: (body: unknown) => Promise<{
    response: Response;
    body: Record<string, unknown>;
  }>;
  rows: () => Promise<Array<typeof enquiries.$inferSelect>>;
};

/**
 * Run one test inside a transaction that always rolls back.
 *
 * `tx.rollback()` throws a control-flow error; the only acceptable error out of
 * this helper is that one. A real failure inside the test still fails the test.
 */
async function scenario(run: (app: App) => Promise<void>): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      const handler = createEnquiriesHandler({ db: tx });

      await run({
        async save(body) {
          const response = await handler(request(body));
          return {
            response,
            body: (await response.json()) as Record<string, unknown>,
          };
        },
        rows: () => tx.select().from(enquiries),
      });

      tx.rollback();
    });
  } catch (error) {
    if (error instanceof TransactionRollbackError) return;
    throw error;
  }

  throw new Error('The test transaction did not roll back.');
}

const RAW_MESSAGE = 'Apnader course certificate ta ki govt approved?';

function reviewed(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Nowshin',
    company: null,
    job_title: null,
    phone: null,
    channel: 'facebook',
    channel_handle: null,
    interest: 'bootcamp',
    kind: 'sales_lead',
    summary: 'Asks whether the course certificate is government approved.',
    suggested_reply: 'Hi Nowshin! Our certificate is {{certificate}}.',
    reply_filled: 'Hi Nowshin! Our certificate is government approved.',
    reply_language: 'banglish',
    needs_attention: false,
    raw_message: RAW_MESSAGE,
    ...overrides,
  };
}

function request(body: unknown): Request {
  return new Request('http://localhost/api/enquiries', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeAll(async () => {
  const found = await sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ('enquiries', 'notes')
  `;

  if (found.length !== 2) {
    throw new Error(
      'The testing branch is missing the enquiries/notes tables. Run pnpm db:push:test.',
    );
  }
});

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

describe('POST /api/enquiries', () => {
  it('creates exactly one enquiry, in New, with the original message verbatim', async () => {
    await scenario(async ({ save, rows }) => {
      const message = '  Line one.\n\nLine two — with “quotes”.\t ';
      const { response, body } = await save(reviewed({ raw_message: message }));

      expect(response.status).toBe(201);

      const saved = body.enquiry as Record<string, unknown>;
      expect(saved.status).toBe('new');
      expect(saved.raw_message).toBe(message);
      expect(saved.last_contacted_at).toBeNull();
      expect(body.duplicateOf).toBeNull();

      const stored = await rows();
      expect(stored).toHaveLength(1);
      expect(stored[0]!.status).toBe('new');
      expect(stored[0]!.rawMessage).toBe(message);
    });
  });

  it('forces New even when the caller sends a status', async () => {
    await scenario(async ({ save, rows }) => {
      const { response, body } = await save(
        reviewed({ status: 'paid', raw_message: RAW_MESSAGE }),
      );

      expect(response.status).toBe(201);
      expect((body.enquiry as Record<string, unknown>).status).toBe('new');

      const stored = await rows();
      expect(stored[0]!.status).toBe('new');
      expect(stored[0]!.lastContactedAt).toBeNull();
    });
  });

  it('warns about an earlier enquiry with the same phone and still saves', async () => {
    await scenario(async ({ save, rows }) => {
      const first = await save(
        reviewed({ name: 'Nowshin', phone: '01712345678' }),
      );
      expect(first.response.status).toBe(201);

      const second = await save(
        reviewed({ name: 'Nowshin again', phone: '01712-345 678' }),
      );

      expect(second.response.status).toBe(201);

      const duplicateOf = second.body.duplicateOf as Record<string, unknown>;
      expect(duplicateOf.name).toBe('Nowshin');
      expect(duplicateOf.id).toBe(
        (first.body.enquiry as Record<string, unknown>).id,
      );

      const stored = await rows();
      expect(stored).toHaveLength(2);
    });
  });

  it('does not call two enquiries without a phone duplicates', async () => {
    await scenario(async ({ save, rows }) => {
      await save(reviewed({ name: 'No phone one' }));
      const { body } = await save(reviewed({ name: 'No phone two' }));

      expect(body.duplicateOf).toBeNull();
      expect(await rows()).toHaveLength(2);
    });
  });

  it('does not warn for a different phone number', async () => {
    await scenario(async ({ save, rows }) => {
      await save(reviewed({ phone: '01712345678' }));
      const { body } = await save(reviewed({ phone: '01812345678' }));

      expect(body.duplicateOf).toBeNull();
      expect(await rows()).toHaveLength(2);
    });
  });

  it('keeps the reply template and stores the filled version separately', async () => {
    await scenario(async ({ save, rows }) => {
      const template = 'The fee is {{price}} and classes start {{start_date}}.';
      const filled = 'The fee is 5,000 taka and classes start 1 December.';

      const { response, body } = await save(
        reviewed({ suggested_reply: template, reply_filled: filled }),
      );

      expect(response.status).toBe(201);

      const saved = body.enquiry as Record<string, unknown>;
      expect(saved.suggested_reply).toBe(template);
      expect(saved.reply_filled).toBe(filled);

      const stored = await rows();
      expect(stored[0]!.suggestedReply).toBe(template);
      expect(stored[0]!.replyFilled).toBe(filled);
    });
  });

  it('stores a placeholder-free reply as its own filled version', async () => {
    await scenario(async ({ save }) => {
      const reply = 'Thanks for reaching out. We will call you today.';
      const { body } = await save(
        reviewed({ suggested_reply: reply, reply_filled: null }),
      );

      const saved = body.enquiry as Record<string, unknown>;
      expect(saved.suggested_reply).toBe(reply);
      expect(saved.reply_filled).toBe(reply);
    });
  });

  it('leaves the filled version empty when a template was never filled', async () => {
    await scenario(async ({ save }) => {
      const { body } = await save(
        reviewed({ suggested_reply: 'The fee is {{price}}.', reply_filled: '' }),
      );

      const saved = body.enquiry as Record<string, unknown>;
      expect(saved.suggested_reply).toBe('The fee is {{price}}.');
      expect(saved.reply_filled).toBeNull();
    });
  });

  it('normalises a formatted phone and treats an impossible one as absent', async () => {
    await scenario(async ({ save }) => {
      const formatted = await save(reviewed({ phone: '01712-345 678' }));
      expect(
        (formatted.body.enquiry as Record<string, unknown>).phone,
      ).toBe('01712345678');

      const impossible = await save(reviewed({ phone: 'call me maybe' }));
      expect(
        (impossible.body.enquiry as Record<string, unknown>).phone,
      ).toBeNull();
    });
  });

  it('rejects a missing name without writing anything', async () => {
    await scenario(async ({ save, rows }) => {
      const { response, body } = await save(reviewed({ name: '   ' }));

      expect(response.status).toBe(422);
      expect(body.error).toBe('invalid_enquiry');
      expect(await rows()).toHaveLength(0);
    });
  });

  it('rejects a missing original message without writing anything', async () => {
    await scenario(async ({ save, rows }) => {
      const { response, body } = await save(reviewed({ raw_message: '   ' }));

      expect(response.status).toBe(400);
      expect(body.error).toBe('raw_message_required');
      expect(await rows()).toHaveLength(0);
    });
  });

  it('rejects malformed JSON and a non-object body', async () => {
    await scenario(async ({ save, rows }) => {
      const malformed = await save('{');
      expect(malformed.response.status).toBe(400);

      const array = await save([]);
      expect(array.response.status).toBe(400);

      expect(await rows()).toHaveLength(0);
    });
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createEnquiryListHandler,
  type EnquiryListResponse,
} from '@/lib/api/enquiry-list';
import {
  createEnquiryUpdateHandler,
  type UpdateEnquiryResponse,
} from '@/lib/api/enquiry-update';
import {
  createPipelineHandler,
  type PipelineResponse,
} from '@/lib/api/pipeline';
import {
  enquiries,
  notes,
  type Enquiry,
  type NewEnquiry,
  type Note,
} from '@/lib/db/schema';
import {
  assertSchemaPresent,
  closeTestDatabase,
  withRollback,
} from './support/database';

/**
 * Seam 2: the pipeline, list and card-move HTTP routes against a real
 * Postgres transaction.
 *
 * The question these tests answer is the wiring: does the board query really
 * exclude non-leads, does a move really stamp contact time, does a note alone
 * really leave it alone, and does the list really honour both filters.
 */

const NOW = new Date('2026-11-04T12:00:00.000Z');
const OLD = new Date('2026-11-01T09:30:00.000Z');
const OMITTED_UUID = '00000000-0000-4000-8000-000000000000';

type App = {
  pipeline: () => Promise<{ response: Response; body: PipelineResponse }>;
  list: (
    query?: string,
  ) => Promise<{ response: Response; body: EnquiryListResponse }>;
  update: (
    id: string,
    body: unknown,
  ) => Promise<{ response: Response; body: UpdateEnquiryResponse }>;
  seed: (overrides?: Partial<NewEnquiry>) => Promise<Enquiry>;
  rows: () => Promise<Enquiry[]>;
  notes: () => Promise<Note[]>;
};

function request(id: string, body: unknown): Request {
  return new Request(`http://localhost/api/enquiries/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function scenario(run: (app: App) => Promise<void>): Promise<void> {
  await withRollback(async (tx) => {
    // Ticket 06 seeds the testing branch. Clearing inside the transaction
    // keeps the counts and order deterministic; the rollback restores the
    // demo data when the test finishes.
    await tx.delete(enquiries);

    const pipelineHandler = createPipelineHandler({ db: tx, now: () => NOW });
    const listHandler = createEnquiryListHandler({ db: tx });
    const updateHandler = createEnquiryUpdateHandler({ db: tx, now: () => NOW });
    let seeded = 0;

    await run({
      async pipeline() {
        const response = await pipelineHandler();
        return {
          response,
          body: (await response.json()) as PipelineResponse,
        };
      },
      async list(query = '') {
        const response = await listHandler(
          new Request(`http://localhost/api/enquiries${query}`),
        );
        return {
          response,
          body: (await response.json()) as EnquiryListResponse,
        };
      },
      async update(id, body) {
        const response = await updateHandler(request(id, body), {
          params: Promise.resolve({ id }),
        });
        return {
          response,
          body: (await response.json()) as UpdateEnquiryResponse,
        };
      },
      async seed(overrides = {}) {
        seeded += 1;
        const [row] = await tx
          .insert(enquiries)
          .values({
            name: `Person ${seeded}`,
            channel: 'whatsapp',
            interest: 'bootcamp',
            kind: 'sales_lead',
            status: 'new',
            summary: '',
            rawMessage: 'Seeded message',
            suggestedReply: '',
            replyLanguage: 'en',
            ...overrides,
          })
          .returning();

        if (!row) throw new Error('The test seed did not insert a row.');
        return row;
      },
      rows: () => tx.select().from(enquiries),
      notes: () => tx.select().from(notes),
    });
  });
}

beforeAll(assertSchemaPresent);

afterAll(closeTestDatabase);

describe('GET /api/pipeline', () => {
  it('returns five columns containing only sales leads', async () => {
    await scenario(async ({ pipeline, seed }) => {
      await seed({ name: 'Lead one', status: 'new' });
      await seed({ name: 'Lead two', status: 'new' });
      await seed({ name: 'Lead three', status: 'contacted' });
      await seed({ name: 'Lead four', status: 'interested' });
      await seed({ name: 'Lead five', status: 'paid' });
      await seed({ name: 'Lead six', status: 'lost' });

      const spam = await seed({ name: 'Spam bot', kind: 'spam' });
      const jobSeeker = await seed({ name: 'Job seeker', kind: 'job_seeker' });
      const support = await seed({ name: 'Support case', kind: 'support' });
      const unclear = await seed({ name: 'Unclear message', kind: 'unclear' });

      const { response, body } = await pipeline();

      expect(response.status).toBe(200);
      expect(body.columns.map((column) => column.status)).toEqual([
        'new',
        'contacted',
        'interested',
        'paid',
        'lost',
      ]);
      expect(body.columns.map((column) => column.count)).toEqual([
        2, 1, 1, 1, 1,
      ]);
      expect(body.total).toBe(6);

      const cards = body.columns.flatMap((column) => column.cards);
      expect(cards).toHaveLength(6);
      expect(cards.every((card) => card.kind === 'sales_lead')).toBe(true);

      const ids = new Set(cards.map((card) => card.id));
      for (const nonLead of [spam, jobSeeker, support, unclear]) {
        expect(ids.has(nonLead.id)).toBe(false);
      }

      for (const column of body.columns) {
        expect(column.count).toBe(column.cards.length);
      }
    });
  });

  it('shows the card fields and measures age since the last contact', async () => {
    await scenario(async ({ pipeline, seed }) => {
      const fresh = await seed({
        name: 'Nowshin',
        company: 'Gazipur Textiles',
        jobTitle: 'Operations Lead',
        interest: 'corporate',
        kind: 'sales_lead',
        status: 'new',
        needsAttention: true,
        summary: 'Wants AI training for forty people.',
        createdAt: OLD,
        lastContactedAt: null,
      });

      const contacted = await seed({
        name: 'Rafiq',
        status: 'contacted',
        createdAt: new Date('2026-10-20T08:00:00.000Z'),
        lastContactedAt: new Date('2026-11-04T10:00:00.000Z'),
      });

      const { body } = await pipeline();
      const cards = body.columns.flatMap((column) => column.cards);
      const freshCard = cards.find((card) => card.id === fresh.id);
      const contactedCard = cards.find((card) => card.id === contacted.id);

      expect(freshCard).toMatchObject({
        name: 'Nowshin',
        company: 'Gazipur Textiles',
        job_title: 'Operations Lead',
        interest: 'corporate',
        kind: 'sales_lead',
        status: 'new',
        needs_attention: true,
        summary: 'Wants AI training for forty people.',
        last_contacted_at: null,
        age_seconds: (NOW.getTime() - OLD.getTime()) / 1000,
      });

      expect(contactedCard).toMatchObject({
        status: 'contacted',
        last_contacted_at: '2026-11-04T10:00:00.000Z',
        age_seconds: 2 * 60 * 60,
      });
    });
  });

  it('returns all five columns even when there are no leads', async () => {
    await scenario(async ({ pipeline }) => {
      const { response, body } = await pipeline();

      expect(response.status).toBe(200);
      expect(body.columns).toHaveLength(5);
      expect(body.columns.every((column) => column.count === 0)).toBe(true);
      expect(body.columns.every((column) => column.cards.length === 0)).toBe(true);
      expect(body.total).toBe(0);
    });
  });
});

describe('PATCH /api/enquiries/:id', () => {
  it('moves a card, stamps the contact time and appends the note', async () => {
    await scenario(async ({ update, seed, rows, notes }) => {
      const card = await seed({
        name: 'Nowshin',
        status: 'new',
        createdAt: OLD,
        lastContactedAt: null,
      });

      const { response, body } = await update(card.id, {
        status: 'interested',
        note: '  Called. They want the December cohort.  ',
      });

      expect(response.status).toBe(200);
      expect(body.enquiry.status).toBe('interested');
      expect(body.enquiry.last_contacted_at).toBe(NOW.toISOString());
      expect(body.note).toMatchObject({
        enquiry_id: card.id,
        body: 'Called. They want the December cohort.',
      });

      const [stored] = await rows();
      expect(stored!.status).toBe('interested');
      expect(stored!.lastContactedAt).toEqual(NOW);

      const storedNotes = await notes();
      expect(storedNotes).toHaveLength(1);
      expect(storedNotes[0]!.enquiryId).toBe(card.id);
      expect(storedNotes[0]!.body).toBe('Called. They want the December cohort.');
    });
  });

  it('appends a note without moving the card or restamping contact time', async () => {
    await scenario(async ({ update, seed, rows, notes }) => {
      const card = await seed({
        status: 'contacted',
        createdAt: new Date('2026-10-20T08:00:00.000Z'),
        lastContactedAt: OLD,
      });

      const { response, body } = await update(card.id, {
        note: 'Left a voicemail.',
      });

      expect(response.status).toBe(200);
      expect(body.enquiry.status).toBe('contacted');
      expect(body.enquiry.last_contacted_at).toBe(OLD.toISOString());

      const [stored] = await rows();
      expect(stored!.status).toBe('contacted');
      expect(stored!.lastContactedAt).toEqual(OLD);

      const storedNotes = await notes();
      expect(storedNotes).toHaveLength(1);
      expect(storedNotes[0]!.body).toBe('Left a voicemail.');
    });
  });

  it('treats a repeated status plus a note as note-only', async () => {
    await scenario(async ({ update, seed, rows, notes }) => {
      const card = await seed({ status: 'interested', lastContactedAt: OLD });

      const { response } = await update(card.id, {
        status: 'interested',
        note: 'Sent the schedule.',
      });

      expect(response.status).toBe(200);

      const [stored] = await rows();
      expect(stored!.status).toBe('interested');
      expect(stored!.lastContactedAt).toEqual(OLD);
      expect(await notes()).toHaveLength(1);
    });
  });

  it('moves and stamps without writing a note when none was given', async () => {
    await scenario(async ({ update, seed, rows, notes }) => {
      const card = await seed({ status: 'new', lastContactedAt: null });

      const { response, body } = await update(card.id, { status: 'paid' });

      expect(response.status).toBe(200);
      expect(body.note).toBeNull();

      const [stored] = await rows();
      expect(stored!.status).toBe('paid');
      expect(stored!.lastContactedAt).toEqual(NOW);
      expect(await notes()).toHaveLength(0);
    });
  });

  it('keeps the contact time when a card moves again later', async () => {
    await scenario(async ({ update, seed, rows, notes }) => {
      const card = await seed({
        status: 'contacted',
        lastContactedAt: OLD,
        createdAt: new Date('2026-10-20T08:00:00.000Z'),
      });

      const { response, body } = await update(card.id, {
        status: 'interested',
        note: 'Asked for the December schedule.',
      });

      expect(response.status).toBe(200);
      expect(body.enquiry.status).toBe('interested');
      expect(body.enquiry.last_contacted_at).toBe(OLD.toISOString());

      const [stored] = await rows();
      expect(stored!.status).toBe('interested');
      expect(stored!.lastContactedAt).toEqual(OLD);
      expect(await notes()).toHaveLength(1);
    });
  });

  it('flags attention without moving the card, restamping or writing a note', async () => {
    await scenario(async ({ update, seed, rows, notes }) => {
      const card = await seed({ status: 'new', lastContactedAt: null });

      const { response, body } = await update(card.id, {
        needs_attention: true,
      });

      expect(response.status).toBe(200);
      expect(body.enquiry.needs_attention).toBe(true);
      expect(body.enquiry.status).toBe('new');
      expect(body.enquiry.last_contacted_at).toBeNull();
      expect(body.note).toBeNull();

      const [stored] = await rows();
      expect(stored!.needsAttention).toBe(true);
      expect(stored!.lastContactedAt).toBeNull();
      expect(await notes()).toHaveLength(0);
    });
  });

  it('clears an attention flag that is already set', async () => {
    await scenario(async ({ update, seed, rows }) => {
      const card = await seed({
        status: 'contacted',
        lastContactedAt: OLD,
        needsAttention: true,
      });

      const { response, body } = await update(card.id, {
        needs_attention: false,
      });

      expect(response.status).toBe(200);
      expect(body.enquiry.needs_attention).toBe(false);

      const [stored] = await rows();
      expect(stored!.needsAttention).toBe(false);
      expect(stored!.lastContactedAt).toEqual(OLD);
    });
  });

  it('rejects an attention flag that is not a boolean', async () => {
    await scenario(async ({ update, seed, rows }) => {
      const card = await seed({});

      const { response } = await update(card.id, { needs_attention: 'yes' });

      expect(response.status).toBe(422);

      const [stored] = await rows();
      expect(stored!.needsAttention).toBe(false);
    });
  });

  it('rejects an unknown status without changing the card or writing a note', async () => {
    await scenario(async ({ update, seed, rows, notes }) => {
      const card = await seed({ status: 'new', lastContactedAt: null });

      const { response, body } = await update(card.id, {
        status: 'negotiating',
        note: 'Should not be written.',
      });

      expect(response.status).toBe(422);
      expect((body as unknown as { error: string }).error).toBe(
        'invalid_status_change',
      );

      const [stored] = await rows();
      expect(stored!.status).toBe('new');
      expect(stored!.lastContactedAt).toBeNull();
      expect(await notes()).toHaveLength(0);
    });
  });

  it('rejects a request that moves nothing and writes no note', async () => {
    await scenario(async ({ update, seed, rows }) => {
      const card = await seed({ status: 'new' });

      const { response, body } = await update(card.id, {});

      expect(response.status).toBe(422);
      expect((body as unknown as { error: string }).error).toBe(
        'nothing_to_update',
      );

      const [stored] = await rows();
      expect(stored!.status).toBe('new');
    });
  });

  it('returns 404 for an id that does not exist', async () => {
    await scenario(async ({ update, rows }) => {
      const { response } = await update(OMITTED_UUID, { note: 'Hello?' });

      expect(response.status).toBe(404);
      expect(await rows()).toHaveLength(0);
    });
  });

  it('rejects malformed JSON and a non-object body', async () => {
    await scenario(async ({ update, seed, rows, notes }) => {
      const card = await seed({});

      expect((await update(card.id, '{')).response.status).toBe(400);
      expect((await update(card.id, [])).response.status).toBe(400);

      const [stored] = await rows();
      expect(stored!.status).toBe('new');
      expect(await notes()).toHaveLength(0);
    });
  });

  it('fills a saved reply without overwriting its template', async () => {
    await scenario(async ({ update, seed, rows }) => {
      const card = await seed({
        suggestedReply: 'The fee is {{price}}.',
        replyFilled: null,
      });

      const { response, body } = await update(card.id, {
        reply_filled: 'The fee is 5,000 taka.',
      });

      expect(response.status).toBe(200);
      expect(body.enquiry.suggested_reply).toBe('The fee is {{price}}.');
      expect(body.enquiry.reply_filled).toBe('The fee is 5,000 taka.');

      const [stored] = await rows();
      expect(stored!.suggestedReply).toBe('The fee is {{price}}.');
      expect(stored!.replyFilled).toBe('The fee is 5,000 taka.');
    });
  });

  it('rejects an edited template with a token outside the allowlist', async () => {
    await scenario(async ({ update, seed, rows }) => {
      const card = await seed({
        suggestedReply: 'Hello.',
        replyFilled: 'Hello.',
      });

      const { response, body } = await update(card.id, {
        suggested_reply: 'The fee is {{cohort_two}}.',
      });

      expect(response.status).toBe(422);
      expect((body as unknown as { error: string }).error).toBe(
        'invalid_status_change',
      );

      const [stored] = await rows();
      expect(stored!.suggestedReply).toBe('Hello.');
    });
  });

  it('moves updated_at only when the status moves', async () => {
    await scenario(async ({ update, seed, rows }) => {
      const card = await seed({ status: 'contacted', lastContactedAt: OLD });
      const before = (await rows())[0]!;

      await update(card.id, { note: 'Left a voicemail.' });
      let [stored] = await rows();
      expect(stored!.updatedAt).toEqual(before.updatedAt);

      await update(card.id, { needs_attention: true });
      [stored] = await rows();
      expect(stored!.updatedAt).toEqual(before.updatedAt);

      await update(card.id, { status: 'interested' });
      [stored] = await rows();
      expect(stored!.updatedAt).toEqual(NOW);
    });
  });
});

describe('GET /api/enquiries', () => {
  it('filters by status and kind, and lists non-leads too', async () => {
    await scenario(async ({ list, seed }) => {
      const salesNew = await seed({ name: 'Sales new', kind: 'sales_lead', status: 'new' });
      const salesContacted = await seed({
        name: 'Sales contacted',
        kind: 'sales_lead',
        status: 'contacted',
      });
      const spam = await seed({ name: 'Spam', kind: 'spam', status: 'new' });
      const jobSeeker = await seed({
        name: 'Job seeker',
        kind: 'job_seeker',
        status: 'contacted',
      });
      await seed({ name: 'Support', kind: 'support', status: 'paid' });

      const all = await list();
      expect(all.response.status).toBe(200);
      expect(all.body.total).toBe(5);
      expect(all.body.filters).toEqual({ status: null, kind: null });

      const allIds = all.body.enquiries.map((enquiry) => enquiry.id);
      expect(allIds).toEqual(
        expect.arrayContaining([salesNew.id, spam.id, jobSeeker.id]),
      );

      const newOnly = await list('?status=new');
      expect(newOnly.body.total).toBe(2);
      expect(newOnly.body.enquiries.every((item) => item.status === 'new')).toBe(
        true,
      );
      expect(newOnly.body.enquiries.map((item) => item.id)).toEqual(
        expect.arrayContaining([salesNew.id, spam.id]),
      );

      const leadsOnly = await list('?kind=sales_lead');
      expect(leadsOnly.body.total).toBe(2);
      expect(
        leadsOnly.body.enquiries.every((item) => item.kind === 'sales_lead'),
      ).toBe(true);

      const both = await list('?status=contacted&kind=sales_lead');
      expect(both.body.total).toBe(1);
      expect(both.body.enquiries[0]!.id).toBe(salesContacted.id);
      expect(both.body.filters).toEqual({
        status: 'contacted',
        kind: 'sales_lead',
      });
    });
  });

  it('rejects a status or kind outside the contract', async () => {
    await scenario(async ({ list }) => {
      const badStatus = await list('?status=pending');
      expect(badStatus.response.status).toBe(400);
      expect((badStatus.body as unknown as { error: string }).error).toBe(
        'invalid_filter',
      );

      const badKind = await list('?kind=friend');
      expect(badKind.response.status).toBe(400);
    });
  });
});

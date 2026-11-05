import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createRemindersHandler,
  type RemindersResponse,
} from '@/lib/api/reminders';
import {
  createSummaryHandler,
  type WeeklySummaryResponse,
} from '@/lib/api/summary';
import { AiUnavailableError } from '@/lib/ai/extractor';
import type { SummaryNarrator } from '@/lib/ai/summary';
import type { SummaryFacts } from '@/lib/domain/summary';
import {
  enquiries,
  type Enquiry,
  type NewEnquiry,
} from '@/lib/db/schema';
import {
  assertSchemaPresent,
  closeTestDatabase,
  withRollback,
} from './support/database';

/**
 * Seam 2: the follow-up and summary HTTP routes against a real Postgres
 * transaction.
 *
 * The questions these tests answer are the wiring: does the reminders query
 * really exclude the wrong kinds and statuses before comparing time, is the
 * 48-hour boundary the one the ticket states, is the queue oldest-first, and
 * are the summary's numbers the database's rather than the narrator's.
 */

const NOW = new Date('2026-11-04T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

function ago(hours: number): Date {
  return new Date(NOW.getTime() - hours * HOUR);
}

type SummaryBody =
  | WeeklySummaryResponse
  | {
      error: string;
      message?: string;
      issues?: string[];
      facts?: SummaryFacts;
    };

type App = {
  reminders: () => Promise<{ response: Response; body: RemindersResponse }>;
  summary: () => Promise<{ response: Response; body: SummaryBody }>;
  seed: (overrides?: Partial<NewEnquiry>) => Promise<Enquiry>;
  narratorCalls: SummaryFacts[];
  setNarration: (template: string) => void;
  setNarrationFailure: (error: Error | null) => void;
};

async function scenario(run: (app: App) => Promise<void>): Promise<void> {
  await withRollback(async (tx) => {
    // The aggregate counts the whole table. Clearing inside the transaction
    // makes the expected numbers deterministic even if the testing branch has
    // demo data from a later session; the rollback puts that data back.
    await tx.delete(enquiries);

    let seeded = 0;
    let template = '';
    let failure: Error | null = null;
    const narratorCalls: SummaryFacts[] = [];

    const narrator: SummaryNarrator = {
      async narrate(facts) {
        narratorCalls.push(facts);
        if (failure) throw failure;
        return template;
      },
    };

    const remindersHandler = createRemindersHandler({
      db: tx,
      now: () => NOW,
    });
    const summaryHandler = createSummaryHandler({
      db: tx,
      now: () => NOW,
      narrator,
    });

    await run({
      async reminders() {
        const response = await remindersHandler();
        return {
          response,
          body: (await response.json()) as RemindersResponse,
        };
      },
      async summary() {
        const response = await summaryHandler();
        return {
          response,
          body: (await response.json()) as SummaryBody,
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
            createdAt: NOW,
            updatedAt: NOW,
            lastContactedAt: null,
            ...overrides,
          })
          .returning();

        if (!row) throw new Error('The test seed did not insert a row.');
        return row;
      },
      narratorCalls,
      setNarration(next) {
        template = next;
      },
      setNarrationFailure(error) {
        failure = error;
      },
    });
  });
}

beforeAll(assertSchemaPresent);

afterAll(closeTestDatabase);

describe('GET /api/reminders', () => {
  it('is absent at 47h59m, present at exactly 48h and beyond', async () => {
    await scenario(async ({ reminders, seed }) => {
      const almost = await seed({
        status: 'contacted',
        createdAt: ago(200),
        lastContactedAt: new Date(NOW.getTime() - (47 * HOUR + 59 * 60 * 1000)),
      });
      const exactly = await seed({
        status: 'contacted',
        createdAt: ago(200),
        lastContactedAt: ago(48),
      });
      const beyond = await seed({
        status: 'new',
        createdAt: ago(48.5),
        lastContactedAt: null,
      });
      const recentlyReached = await seed({
        status: 'contacted',
        createdAt: ago(200),
        lastContactedAt: ago(1),
      });

      const { response, body } = await reminders();

      expect(response.status).toBe(200);
      expect(body.total).toBe(2);
      expect(body.enquiries.map((item) => item.id)).toEqual([
        beyond.id,
        exactly.id,
      ]);
      expect(body.enquiries.map((item) => item.id)).not.toContain(almost.id);
      expect(body.enquiries.map((item) => item.id)).not.toContain(
        recentlyReached.id,
      );

      expect(body.rule).toEqual({
        hours: 48,
        cutoff: '2026-11-02T12:00:00.000Z',
      });
      expect(body.generated_at).toBe(NOW.toISOString());

      const exact = body.enquiries.find((item) => item.id === exactly.id)!;
      expect(exact.waiting_since).toBe(ago(48).toISOString());
      expect(exact.age_seconds).toBe(48 * 60 * 60);
      expect(exact.last_contacted_at).toBe(ago(48).toISOString());
    });
  });

  it('excludes spam, job seekers, support and unclear before the time test', async () => {
    await scenario(async ({ reminders, seed }) => {
      const due = await seed({
        name: 'Genuine lead',
        status: 'new',
        createdAt: ago(72),
      });

      for (const kind of ['spam', 'job_seeker', 'support', 'unclear'] as const) {
        await seed({ kind, status: 'new', createdAt: ago(24 * 30) });
      }

      for (const status of ['interested', 'paid', 'lost'] as const) {
        await seed({ status, createdAt: ago(24 * 30) });
      }

      const { body } = await reminders();

      expect(body.total).toBe(1);
      expect(body.enquiries.map((item) => item.id)).toEqual([due.id]);
    });
  });

  it('orders the queue by the oldest follow-up clock, not by creation', async () => {
    await scenario(async ({ reminders, seed }) => {
      const oldest = await seed({
        name: 'Oldest creation',
        status: 'new',
        createdAt: ago(100),
        lastContactedAt: null,
      });
      const contactedLongAgo = await seed({
        name: 'Created today, last spoken to long ago',
        status: 'contacted',
        createdAt: NOW,
        lastContactedAt: ago(80),
      });
      const newer = await seed({
        name: 'Newer creation',
        status: 'new',
        createdAt: ago(60),
        lastContactedAt: null,
      });

      const { body } = await reminders();

      expect(body.enquiries.map((item) => item.id)).toEqual([
        oldest.id,
        contactedLongAgo.id,
        newer.id,
      ]);
      expect(body.enquiries.map((item) => item.age_seconds)).toEqual([
        100 * 60 * 60,
        80 * 60 * 60,
        60 * 60 * 60,
      ]);
    });
  });

  it('returns an empty queue when every lead is fresh or closed', async () => {
    await scenario(async ({ reminders, seed }) => {
      await seed({ status: 'contacted', lastContactedAt: ago(1) });
      await seed({ status: 'paid', createdAt: ago(200) });
      await seed({ status: 'lost', createdAt: ago(200) });
      await seed({ kind: 'job_seeker', createdAt: ago(200) });

      const { response, body } = await reminders();

      expect(response.status).toBe(200);
      expect(body.total).toBe(0);
      expect(body.enquiries).toEqual([]);
    });
  });
});

describe('POST /api/summary', () => {
  it('computes the seven-day aggregate in SQL and narrates it', async () => {
    await scenario(async ({ summary, seed, narratorCalls, setNarration }) => {
      await seed({
        name: 'New lead',
        kind: 'sales_lead',
        status: 'new',
        createdAt: ago(48),
        updatedAt: ago(48),
        lastContactedAt: null,
      });
      await seed({
        name: 'Contacted lead',
        kind: 'sales_lead',
        status: 'contacted',
        createdAt: ago(72),
        updatedAt: ago(1),
        lastContactedAt: ago(1),
      });
      await seed({
        name: 'Paid lead',
        kind: 'sales_lead',
        status: 'paid',
        createdAt: ago(24),
        updatedAt: ago(24),
        lastContactedAt: ago(24),
      });
      await seed({
        name: 'Spam',
        kind: 'spam',
        status: 'new',
        createdAt: ago(96),
        updatedAt: ago(96),
      });
      await seed({
        name: 'Job seeker',
        kind: 'job_seeker',
        status: 'new',
        createdAt: ago(144),
        updatedAt: ago(144),
      });
      await seed({
        name: 'Support old',
        kind: 'support',
        status: 'new',
        createdAt: ago(720),
        updatedAt: ago(720),
      });
      await seed({
        name: 'Unclear',
        kind: 'unclear',
        status: 'new',
        createdAt: ago(24),
        updatedAt: ago(24),
      });
      // Old rows that must affect the current pipeline shape but not the week.
      await seed({
        name: 'Old paid',
        kind: 'sales_lead',
        status: 'paid',
        createdAt: ago(720),
        updatedAt: ago(720),
        lastContactedAt: ago(720),
      });
      await seed({
        name: 'Old lost',
        kind: 'sales_lead',
        status: 'lost',
        createdAt: ago(720),
        updatedAt: ago(720),
        lastContactedAt: ago(720),
      });

      setNarration(
        '{{received}} came in, including {{sales_leads}} sales leads. {{moved}} moved and {{stuck}} in the follow-up queue.',
      );

      const { response, body } = await summary();

      expect(response.status).toBe(200);
      expect('facts' in body).toBe(true);

      const success = body as WeeklySummaryResponse;
      expect(success.facts.window).toEqual({
        days: 7,
        from: '2026-10-28T12:00:00.000Z',
        to: NOW.toISOString(),
      });
      expect(success.facts.received).toBe(6);
      expect(success.facts.received_by_kind).toEqual({
        sales_lead: 3,
        job_seeker: 1,
        support: 0,
        spam: 1,
        unclear: 1,
      });
      expect(success.facts.moved).toBe(2);
      expect(success.facts.stuck).toBe(1);
      expect(success.facts.leads_by_status).toEqual({
        new: 1,
        contacted: 1,
        interested: 0,
        paid: 2,
        lost: 1,
      });
      expect(success.facts.generated_at).toBe(NOW.toISOString());

      // The narrator saw exactly the database facts, and the numbers in the
      // returned prose came from those facts, not from the model.
      expect(narratorCalls).toEqual([success.facts]);
      expect(success.narrative).toBe(
        '6 came in, including 3 sales leads. 2 moved and 1 in the follow-up queue.',
      );
    });
  });

  it('refuses a narration carrying a number of its own', async () => {
    await scenario(async ({ summary, setNarration }) => {
      setNarration('7 leads arrived this week and {{stuck}} are stuck.');

      const { response, body } = await summary();

      expect(response.status).toBe(502);
      expect((body as { error: string }).error).toBe('invalid_narration');
      expect((body as { issues: string[] }).issues.join(' ')).toContain(
        'placeholders',
      );
      expect((body as { facts: SummaryFacts }).facts.received).toBe(0);
    });
  });

  it('still returns the true facts when the AI is unavailable', async () => {
    await scenario(async ({ summary, seed, setNarrationFailure }) => {
      await seed({ createdAt: NOW, updatedAt: NOW });

      setNarrationFailure(new AiUnavailableError('no key in this test'));

      const { response, body } = await summary();

      expect(response.status).toBe(503);
      expect((body as { error: string }).error).toBe('ai_unavailable');
      expect((body as { facts: SummaryFacts }).facts.received).toBe(1);
    });
  });
});

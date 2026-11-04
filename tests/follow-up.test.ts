import { describe, expect, it } from 'vitest';
import {
  FOLLOW_UP_HOURS,
  followUpAgeSeconds,
  followUpCutoff,
  isDueForFollowUp,
  isFollowUpStatus,
  type FollowUpCandidate,
} from '@/lib/domain/follow-up';
import type { Kind, Status } from '@/lib/domain/enquiry';
import {
  SUMMARY_WINDOW_DAYS,
  SUMMARY_WINDOW_MS,
  SummaryNarrationError,
  emptyKindCounts,
  emptyStatusCounts,
  renderSummaryNarration,
  summaryCountValues,
  summaryWindow,
  type SummaryFacts,
} from '@/lib/domain/summary';

/**
 * Seam 1: the pure domain module. No database, no route, no AI.
 *
 * These are the decisions the queue and the summary must not get wrong: which
 * clock an enquiry is measured from, exactly where the 48-hour boundary sits,
 * who is excluded before time is even considered, and whether a number shown
 * to a reader came from the database or from the model.
 */

const NOW = new Date('2026-11-04T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

function candidate(
  overrides: Partial<FollowUpCandidate> = {},
): FollowUpCandidate {
  return {
    status: 'new',
    kind: 'sales_lead',
    createdAt: new Date(NOW.getTime() - 3 * 24 * HOUR),
    lastContactedAt: null,
    ...overrides,
  };
}

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * HOUR);
}

describe('isDueForFollowUp', () => {
  it('is absent at 47h59m and present at exactly 48h', () => {
    expect(
      isDueForFollowUp(
        candidate({ status: 'contacted', lastContactedAt: hoursAgo(47 + 59 / 60) }),
        NOW,
      ),
    ).toBe(false);

    expect(
      isDueForFollowUp(
        candidate({ status: 'contacted', lastContactedAt: hoursAgo(48) }),
        NOW,
      ),
    ).toBe(true);
  });

  it('is present beyond 48 hours', () => {
    expect(
      isDueForFollowUp(
        candidate({ status: 'contacted', lastContactedAt: hoursAgo(48.001) }),
        NOW,
      ),
    ).toBe(true);
  });

  it('measures from the last contact when there was one', () => {
    const recentlyCreated = candidate({
      status: 'contacted',
      createdAt: hoursAgo(1),
      lastContactedAt: hoursAgo(48),
    });

    expect(isDueForFollowUp(recentlyCreated, NOW)).toBe(true);
  });

  it('measures from creation when nobody has been reached', () => {
    expect(
      isDueForFollowUp(
        candidate({ createdAt: hoursAgo(47 + 59 / 60), lastContactedAt: null }),
        NOW,
      ),
    ).toBe(false);

    expect(
      isDueForFollowUp(
        candidate({ createdAt: hoursAgo(48), lastContactedAt: null }),
        NOW,
      ),
    ).toBe(true);
  });

  it('only chases New and Contacted sales leads', () => {
    const due: Status[] = ['new', 'contacted'];
    const notDue: Status[] = ['interested', 'paid', 'lost'];

    for (const status of due) {
      expect(isDueForFollowUp(candidate({ status }), NOW)).toBe(true);
    }

    for (const status of notDue) {
      expect(isDueForFollowUp(candidate({ status }), NOW)).toBe(false);
    }
  });

  it('excludes every non-sales kind before the time comparison', () => {
    const nonLeads: Kind[] = ['job_seeker', 'support', 'spam', 'unclear'];

    for (const kind of nonLeads) {
      expect(
        isDueForFollowUp(
          candidate({
            kind,
            createdAt: hoursAgo(24 * 30),
            lastContactedAt: null,
          }),
          NOW,
        ),
      ).toBe(false);
    }

    expect(isDueForFollowUp(candidate({ kind: 'sales_lead' }), NOW)).toBe(true);
  });
});

describe('follow-up clock helpers', () => {
  it('puts the cutoff exactly 48 hours before now, in UTC', () => {
    const cutoff = followUpCutoff(NOW);

    expect(FOLLOW_UP_HOURS).toBe(48);
    expect(cutoff.toISOString()).toBe('2026-11-02T12:00:00.000Z');
    expect(NOW.getTime() - cutoff.getTime()).toBe(48 * HOUR);
  });

  it('reports age from the same clock the queue uses', () => {
    expect(
      followUpAgeSeconds(
        candidate({ status: 'contacted', lastContactedAt: hoursAgo(50) }),
        NOW,
      ),
    ).toBe(50 * 60 * 60);

    expect(
      followUpAgeSeconds(
        candidate({ createdAt: hoursAgo(49), lastContactedAt: null }),
        NOW,
      ),
    ).toBe(49 * 60 * 60);
  });

  it('never reports a negative age', () => {
    expect(
      followUpAgeSeconds(
        candidate({ createdAt: new Date(NOW.getTime() + HOUR) }),
        NOW,
      ),
    ).toBe(0);
  });

  it('recognises exactly the two open statuses', () => {
    expect(isFollowUpStatus('new')).toBe(true);
    expect(isFollowUpStatus('contacted')).toBe(true);
    expect(isFollowUpStatus('interested')).toBe(false);
    expect(isFollowUpStatus('paid')).toBe(false);
    expect(isFollowUpStatus('lost')).toBe(false);
  });
});

function facts(overrides: Partial<SummaryFacts> = {}): SummaryFacts {
  return {
    window: {
      days: SUMMARY_WINDOW_DAYS,
      from: new Date(NOW.getTime() - SUMMARY_WINDOW_MS).toISOString(),
      to: NOW.toISOString(),
    },
    received: 12,
    received_by_kind: {
      ...emptyKindCounts(),
      sales_lead: 6,
      job_seeker: 2,
      support: 1,
      spam: 2,
      unclear: 1,
    },
    moved: 4,
    stuck: 3,
    leads_by_status: {
      ...emptyStatusCounts(),
      new: 2,
      contacted: 1,
      interested: 1,
      paid: 1,
      lost: 1,
    },
    generated_at: NOW.toISOString(),
    ...overrides,
  };
}

describe('summary window', () => {
  it('is seven UTC days ending at the supplied instant', () => {
    const { from, to } = summaryWindow(NOW);

    expect(SUMMARY_WINDOW_DAYS).toBe(7);
    expect(from.toISOString()).toBe('2026-10-28T12:00:00.000Z');
    expect(to.toISOString()).toBe(NOW.toISOString());
  });
});

describe('summary counts', () => {
  it('maps every allowed placeholder to a database fact', () => {
    expect(summaryCountValues(facts())).toEqual({
      received: 12,
      sales_leads: 6,
      job_seekers: 2,
      support: 1,
      spam: 2,
      unclear: 1,
      moved: 4,
      stuck: 3,
    });
  });

  it('starts kind and status counts at zero for every allowed value', () => {
    expect(Object.values(emptyKindCounts()).every((count) => count === 0)).toBe(
      true,
    );
    expect(
      Object.values(emptyStatusCounts()).every((count) => count === 0),
    ).toBe(true);
    expect(Object.keys(emptyKindCounts())).toHaveLength(5);
    expect(Object.keys(emptyStatusCounts())).toHaveLength(5);
  });
});

describe('renderSummaryNarration', () => {
  it('fills placeholders from the database facts, not from the model', () => {
    const narrative = renderSummaryNarration(
      '{{received}} enquiries came in, {{sales_leads}} of them sales leads. {{moved}} moved and {{stuck}} are stuck.',
      facts(),
    );

    expect(narrative).toBe(
      '12 enquiries came in, 6 of them sales leads. 4 moved and 3 are stuck.',
    );
  });

  it('fills a repeated placeholder every time', () => {
    expect(
      renderSummaryNarration('{{stuck}} stuck, still {{stuck}}.', facts()),
    ).toBe('3 stuck, still 3.');
  });

  it('rejects a narrative that writes its own digit', () => {
    expect(() =>
      renderSummaryNarration('7 leads moved, {{stuck}} are stuck.', facts()),
    ).toThrow(SummaryNarrationError);
  });

  it('rejects an unknown placeholder rather than showing a token', () => {
    expect(() =>
      renderSummaryNarration('{{revenue}} came in.', facts()),
    ).toThrow(SummaryNarrationError);
  });

  it('rejects a narrative that mentions no count at all', () => {
    expect(() =>
      renderSummaryNarration('It was a busy week for the team.', facts()),
    ).toThrow(SummaryNarrationError);
  });

  it('rejects an empty narrative', () => {
    expect(() => renderSummaryNarration('   ', facts())).toThrow(
      SummaryNarrationError,
    );
  });
});

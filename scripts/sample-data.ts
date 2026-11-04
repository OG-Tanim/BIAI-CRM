import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { NewEnquiry } from '@/lib/db/schema';
import type { Status } from '@/lib/domain/enquiry';
import type {
  Channel,
  Interest,
  Kind,
  ReplyLanguage,
} from '@/lib/domain/extraction';
import { parseCsv } from './lib/csv';

/**
 * The twenty sample enquiries, read from the CSV the project was given.
 *
 * The CSV is the source of truth for the message, the sender line, the phone
 * and the timestamp. This module adds the two things the file cannot carry:
 * the expected extraction (frozen in `docs/IMPLEMENTATION_PLAN.md` §5 plus the
 * anomalies in `docs/SPEC.md`) and the operator state a demo seed needs.
 *
 * Timestamps in the sample file are Dhaka local times. They are stored as
 * absolute instants by attaching the fixed +06:00 offset, which is what makes
 * "original timestamps" mean the same thing in the database and on screen.
 */

const CSV_PATH = fileURLToPath(
  new URL('../sample-enquiries.csv', import.meta.url),
);

const HEADER = ['id', 'channel', 'received at', 'sender name', 'phone', 'message'];

const CHANNEL_BY_LABEL: Record<string, Channel> = {
  WhatsApp: 'whatsapp',
  'Facebook Messenger': 'facebook',
  'Facebook comment': 'facebook',
  'Website form': 'website',
  'Phone call note': 'phone',
};

export type SampleEnquiry = {
  id: number;
  channel: Channel;
  /** The channel word exactly as the CSV spells it, for the eval's sender line. */
  channelLabel: string;
  /** The original instant, parsed as Asia/Dhaka (+06:00). */
  receivedAt: Date;
  senderName: string;
  phone: string | null;
  message: string;
};

export type SampleExpectation = {
  kind: Kind;
  interest: Interest;
  replyLanguage: ReplyLanguage;
  /** The person's name with any role and company removed from the sender line. */
  name: string;
  company: string | null;
  /** Used when the exact spelling is a judgement call (for example "a bank in Motijheel"). */
  companyPattern?: RegExp;
  jobTitle: string | null;
  needsAttention: boolean;
  /** `none` is deliberate for spam: a sales reply would be wrong. */
  reply: 'required' | 'none';
  /** The status the demo seed gives the row. Status never comes from extraction. */
  seedStatus: Status;
  summary: string;
};

function parseDhakaTimestamp(value: string): Date {
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/.exec(value.trim());

  if (!match) {
    throw new Error(
      `Sample timestamp "${value}" is not "YYYY-MM-DD HH:MM" as the CSV promises.`,
    );
  }

  const instant = new Date(`${match[1]}T${match[2]}:00+06:00`);
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`Sample timestamp "${value}" is not a real instant.`);
  }

  return instant;
}

function readSamples(): SampleEnquiry[] {
  const text = readFileSync(CSV_PATH, 'utf8').replace(/^\uFEFF/, '');
  const [header, ...dataRows] = parseCsv(text);

  if (!header || header.map((value) => value.trim()).join(',') !== HEADER.join(',')) {
    throw new Error(
      `sample-enquiries.csv must start with the header: ${HEADER.join(',')}`,
    );
  }

  const samples = dataRows.map((columns): SampleEnquiry => {
    if (columns.length !== HEADER.length) {
      throw new Error(
        `A sample row has ${columns.length} columns, expected ${HEADER.length}.`,
      );
    }

    const [rawId, rawChannel, rawReceivedAt, senderName, rawPhone, message] =
      columns;
    const id = Number(rawId);

    if (!Number.isInteger(id) || id < 1) {
      throw new Error(`Sample id "${rawId}" is not a positive integer.`);
    }

    const channelLabel = rawChannel.trim();
    const channel = CHANNEL_BY_LABEL[channelLabel];
    if (!channel) {
      throw new Error(`Sample #${id} has an unknown channel "${channelLabel}".`);
    }

    const phone = rawPhone.trim() === '' ? null : rawPhone.trim();
    if (phone !== null && !/^\+?\d{7,15}$/.test(phone)) {
      throw new Error(`Sample #${id} has an unusable phone "${phone}".`);
    }

    return {
      id,
      channel,
      channelLabel,
      receivedAt: parseDhakaTimestamp(rawReceivedAt),
      senderName: senderName.trim(),
      phone,
      message,
    };
  });

  if (samples.length !== 20) {
    throw new Error(`Expected 20 sample enquiries, found ${samples.length}.`);
  }

  const ids = new Set(samples.map((sample) => sample.id));
  if (ids.size !== samples.length) {
    throw new Error('sample-enquiries.csv contains a duplicate id.');
  }

  return samples;
}

export const SAMPLE_ENQUIRIES: readonly SampleEnquiry[] = readSamples();

/**
 * The frozen expectation for each row.
 *
 * The kind/interest/language trio is the fixture table's contract. The
 * name/company/role entries come from the anomalies the spec calls out: the
 * role inside #3, #10 and #18's sender line must be lifted out, and every
 * individual must keep a clean name. The seed status is a demo decision, not
 * an extraction judgement.
 */
const EXPECTATIONS: Record<number, SampleExpectation> = {
  1: {
    kind: 'sales_lead',
    interest: 'bootcamp',
    replyLanguage: 'banglish',
    name: 'Rafi Ahmed',
    company: null,
    jobTitle: null,
    needsAttention: false,
    reply: 'required',
    seedStatus: 'new',
    summary: 'Asks the bootcamp fee and how to pay.',
  },
  2: {
    kind: 'sales_lead',
    interest: 'fellowship',
    replyLanguage: 'bn',
    name: 'Tahmina Akter',
    company: null,
    jobTitle: null,
    needsAttention: false,
    reply: 'required',
    seedStatus: 'new',
    summary: 'Wants to join the fellowship and asks when it starts.',
  },
  3: {
    kind: 'sales_lead',
    interest: 'corporate',
    replyLanguage: 'en',
    name: 'Mahmud Hasan',
    company: 'Gazipur textile company',
    jobTitle: 'Managing Director',
    needsAttention: false,
    reply: 'required',
    seedStatus: 'contacted',
    summary:
      'A Gazipur textile company wants AI training for its 40-person team.',
  },
  4: {
    kind: 'sales_lead',
    interest: 'bootcamp',
    replyLanguage: 'banglish',
    name: 'Sabbir',
    company: null,
    jobTitle: null,
    needsAttention: false,
    reply: 'required',
    seedStatus: 'new',
    summary: 'Asks whether classes are live or recorded.',
  },
  5: {
    kind: 'sales_lead',
    interest: 'unclear',
    replyLanguage: 'en',
    name: 'Nasreen Sultana',
    company: null,
    jobTitle: null,
    needsAttention: false,
    reply: 'required',
    seedStatus: 'new',
    summary:
      'Called about a student discount and will call back tomorrow after 5 PM.',
  },
  6: {
    kind: 'sales_lead',
    interest: 'unclear',
    replyLanguage: 'banglish',
    name: 'Ishtiaq',
    company: null,
    jobTitle: null,
    needsAttention: false,
    reply: 'required',
    seedStatus: 'new',
    summary: 'Asks whether the course leads to a job.',
  },
  7: {
    kind: 'support',
    interest: 'unclear',
    replyLanguage: 'bn',
    name: 'Farzana Rahman',
    company: null,
    jobTitle: null,
    needsAttention: true,
    reply: 'required',
    seedStatus: 'contacted',
    summary:
      'Says she paid via bKash on the 25th and received no confirmation.',
  },
  8: {
    kind: 'sales_lead',
    interest: 'unclear',
    replyLanguage: 'en',
    name: 'Anika Chowdhury',
    company: null,
    jobTitle: null,
    needsAttention: false,
    reply: 'required',
    seedStatus: 'lost',
    summary: 'Asks about the refund policy if she cannot attend.',
  },
  9: {
    kind: 'sales_lead',
    interest: 'bootcamp',
    replyLanguage: 'banglish',
    name: 'Jahid',
    company: null,
    jobTitle: null,
    needsAttention: false,
    reply: 'required',
    seedStatus: 'new',
    summary: 'Asks where the offline class will be held, mentioning Mirpur.',
  },
  10: {
    kind: 'sales_lead',
    interest: 'corporate',
    replyLanguage: 'en',
    name: 'Kamrul Islam',
    company: 'a bank in Motijheel',
    companyPattern: /bank.*motijheel/i,
    jobTitle: 'HR',
    needsAttention: false,
    reply: 'required',
    seedStatus: 'contacted',
    summary:
      'A bank in Motijheel needs a quote for training 120 employees.',
  },
  11: {
    kind: 'spam',
    interest: 'unclear',
    replyLanguage: 'en',
    name: 'Earn Crypto Daily',
    company: null,
    jobTitle: null,
    needsAttention: false,
    reply: 'none',
    seedStatus: 'new',
    summary: 'Promotional crypto spam with a shortened link.',
  },
  12: {
    kind: 'sales_lead',
    interest: 'bootcamp',
    replyLanguage: 'banglish',
    name: 'Rafi Ahmed',
    company: null,
    jobTitle: null,
    needsAttention: false,
    reply: 'required',
    seedStatus: 'contacted',
    summary: 'Follows up asking for the bootcamp price.',
  },
  13: {
    kind: 'sales_lead',
    interest: 'fellowship',
    replyLanguage: 'bn',
    name: 'Mim',
    company: null,
    jobTitle: null,
    needsAttention: false,
    reply: 'required',
    seedStatus: 'new',
    summary: 'A class 9 student asks to join the free masterclass.',
  },
  14: {
    kind: 'sales_lead',
    interest: 'fellowship',
    replyLanguage: 'en',
    name: 'Shirin Sultana',
    company: null,
    jobTitle: null,
    needsAttention: false,
    reply: 'required',
    seedStatus: 'interested',
    summary:
      'A non-technical marketing manager asks if the fellowship suits her.',
  },
  15: {
    kind: 'sales_lead',
    interest: 'bootcamp',
    replyLanguage: 'banglish',
    name: 'Tanvir',
    company: null,
    jobTitle: null,
    needsAttention: false,
    reply: 'required',
    seedStatus: 'contacted',
    summary: 'Asks what the add-on is and what lifetime access means.',
  },
  16: {
    kind: 'support',
    interest: 'unclear',
    replyLanguage: 'en',
    name: 'Habibur Rahman',
    company: null,
    jobTitle: null,
    needsAttention: true,
    reply: 'required',
    seedStatus: 'lost',
    summary:
      'Wants to cancel and get a refund, threatening to post publicly.',
  },
  17: {
    kind: 'sales_lead',
    interest: 'unclear',
    replyLanguage: 'banglish',
    name: 'Nowshin',
    company: null,
    jobTitle: null,
    needsAttention: false,
    reply: 'required',
    seedStatus: 'new',
    summary: 'Asks whether the course certificate is government approved.',
  },
  18: {
    kind: 'sales_lead',
    interest: 'corporate',
    replyLanguage: 'bn',
    name: 'Rezaul Karim',
    company: 'small garment factory',
    jobTitle: 'owner',
    needsAttention: false,
    reply: 'required',
    seedStatus: 'interested',
    summary:
      'Owner of a small garment factory asks about a group discount for 15 staff.',
  },
  19: {
    kind: 'sales_lead',
    interest: 'fellowship',
    replyLanguage: 'en',
    name: 'Samira',
    company: null,
    jobTitle: null,
    needsAttention: false,
    reply: 'required',
    seedStatus: 'paid',
    summary:
      'Asks whether the fellowship fee can be paid in two instalments.',
  },
  20: {
    kind: 'job_seeker',
    interest: 'unclear',
    replyLanguage: 'en',
    name: 'Arif Hossain',
    company: null,
    jobTitle: null,
    needsAttention: false,
    reply: 'required',
    seedStatus: 'new',
    summary: 'Looking for an AI intern role and asking where to apply.',
  },
};

export function expectationFor(id: number): SampleExpectation {
  const expectation = EXPECTATIONS[id];
  if (!expectation) {
    throw new Error(`No frozen expectation for sample #${id}.`);
  }
  return expectation;
}

/** The text the extractor is given: the sender line, then the message. */
export function formatSampleInput(sample: SampleEnquiry): string {
  const header = [`From: ${sample.senderName}`];
  if (sample.phone) header.push(`Phone: ${sample.phone}`);
  header.push(`Channel: ${sample.channelLabel}`);

  return `${header.join('\n')}\n\n${sample.message}`;
}

/** Two hours after arrival: enough to be a real contact, long enough to be overdue. */
const CONTACT_DELAY_MS = 2 * 60 * 60 * 1000;

/**
 * Build the row the seed writes.
 *
 * The board, the queue and the summary show the name, company, role, interest,
 * kind, status, attention flag, summary and timestamps; the reply is not shown
 * by any of them, so it stays empty rather than duplicating fixture prose.
 * `created_at` is the original sample timestamp; `last_contacted_at` exists
 * only for a status that implies somebody was reached.
 */
export function seedEnquiryValues(sample: SampleEnquiry): NewEnquiry {
  const expectation = expectationFor(sample.id);
  const contactedAt =
    expectation.seedStatus === 'new'
      ? null
      : new Date(sample.receivedAt.getTime() + CONTACT_DELAY_MS);

  return {
    name: expectation.name,
    company: expectation.company,
    jobTitle: expectation.jobTitle,
    phone: sample.phone,
    channel: sample.channel,
    channelHandle: null,
    interest: expectation.interest,
    kind: expectation.kind,
    status: expectation.seedStatus,
    needsAttention: expectation.needsAttention,
    summary: expectation.summary,
    rawMessage: sample.message,
    suggestedReply: '',
    replyFilled: null,
    replyLanguage: expectation.replyLanguage,
    createdAt: sample.receivedAt,
    lastContactedAt: contactedAt,
    updatedAt: contactedAt ?? sample.receivedAt,
  };
}

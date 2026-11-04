import { hasBengaliScript } from '@/lib/domain/extraction';

/**
 * Canned model answers, used only when `MOCK_AI=1`.
 *
 * This is not an extraction algorithm: it is a small fixture table so the
 * route, the prompt contract and the guards can be demonstrated without a
 * network call or an API key. The eval in a later session exercises the real
 * model; these fixtures are the "known answer" side of that comparison.
 *
 * Keys are normalised with `fingerprint` so pasted whitespace does not matter.
 */
const FIXTURES: Record<string, unknown> = {
  'Assalamualaikum, apnader 3 day bootcamp er price koto? Payment kibhabe korbo?': {
    name: 'Rafi Ahmed',
    company: null,
    job_title: null,
    phone: '01711000001',
    channel: 'whatsapp',
    channel_handle: null,
    interest: 'bootcamp',
    kind: 'sales_lead',
    summary: 'Asks the bootcamp fee and how to pay.',
    suggested_reply:
      'Walaikum assalam, Rafi! Bootcamp er fee {{price}}, ar payment er jonno {{payment_method}} use korte parben. Apnar kono proshno thakle janaben.',
    reply_language: 'banglish',
    needs_attention: false,
  },

  'ফেলোশিপ প্রোগ্রামে ভর্তি হতে চাই। কবে শুরু হবে?': {
    name: 'Tahmina Akter',
    company: null,
    job_title: null,
    phone: null,
    channel: 'facebook',
    channel_handle: null,
    interest: 'fellowship',
    kind: 'sales_lead',
    summary: 'Wants to join the fellowship and asks when it starts.',
    suggested_reply:
      'আসসালামু আলাইকুম, তাহমিনা! ফেলোশিপ প্রোগ্রাম শুরু হবে {{start_date}}-এ। আপনার আরও কিছু জানার থাকলে জানাবেন।',
    reply_language: 'bn',
    needs_attention: false,
  },

  'I run a 40-person textile company in Gazipur. We want AI training for our team. Can someone call me this week?': {
    name: 'Mahmud Hasan',
    company: 'Gazipur textile company',
    job_title: 'Managing Director',
    phone: '01711000003',
    channel: 'website',
    channel_handle: null,
    interest: 'corporate',
    kind: 'sales_lead',
    summary: 'A Gazipur textile company wants AI training for its 40-person team.',
    suggested_reply:
      'Hello Mahmud, thank you for reaching out. We can arrange AI training for your team and would like to understand your goals. Could you share a good time for a call this week?',
    reply_language: 'en',
    needs_attention: false,
  },

  'Vai class gula live hoy naki recorded? Recording pawa jay?': {
    name: 'Sabbir',
    company: null,
    job_title: null,
    phone: '01711000004',
    channel: 'whatsapp',
    channel_handle: null,
    interest: 'bootcamp',
    kind: 'sales_lead',
    summary: 'Asks whether classes are live or recorded.',
    suggested_reply:
      'Vai, class gula {{schedule}} hoy. Apnar proshno gulor detail janate amra shiggiri jogajog korbo.',
    reply_language: 'banglish',
    needs_attention: false,
  },

  'পেমেন্ট করেছি কিন্তু কোনো কনফার্মেশন পাইনি। আমার নাম ফারজানা রহমান। ২৫ তারিখে বিকাশে দিয়েছি।': {
    name: 'Farzana Rahman',
    company: null,
    job_title: null,
    phone: '01711000007',
    channel: 'whatsapp',
    channel_handle: null,
    interest: 'bootcamp',
    kind: 'support',
    summary: 'Says she paid via bKash on the 25th and received no confirmation.',
    suggested_reply:
      'ফারজানা আপু, আপনার পেমেন্টের বিষয়টি আমরা যাচাই করছি। দ্রুতই কনফার্মেশন জানাবো।',
    reply_language: 'bn',
    needs_attention: true,
  },

  'Do you offer refunds if I cannot attend after paying?': {
    name: 'Anika Chowdhury',
    company: null,
    job_title: null,
    phone: '01711000008',
    channel: 'website',
    channel_handle: null,
    interest: 'bootcamp',
    kind: 'sales_lead',
    summary: 'Asks about the refund policy if she cannot attend.',
    suggested_reply:
      'Hi Anika, thanks for asking. Our refund terms are {{refund_policy}}. We would be happy to walk you through them before you decide.',
    reply_language: 'en',
    needs_attention: false,
  },

  'Earn 5000 USD every day with our crypto signals! Click bit.ly/xxxx now!!!': {
    name: 'Earn Crypto Daily',
    company: null,
    job_title: null,
    phone: null,
    channel: 'facebook',
    channel_handle: null,
    interest: 'unclear',
    kind: 'spam',
    summary: 'Promotional crypto spam with a shortened link.',
    suggested_reply: null,
    reply_language: 'en',
    needs_attention: false,
  },

  "Apnader course certificate ta ki govt approved?": {
    name: 'Nowshin',
    company: null,
    job_title: null,
    phone: null,
    channel: 'facebook',
    channel_handle: null,
    interest: 'bootcamp',
    kind: 'sales_lead',
    summary: 'Asks whether the course certificate is government approved.',
    suggested_reply:
      'Hi Nowshin! Our certificate is {{certificate}}. Let us know if you have any other questions.',
    reply_language: 'banglish',
    needs_attention: false,
  },

  'Looking for a job as an AI intern. Where do I apply?': {
    name: 'Arif Hossain',
    company: null,
    job_title: null,
    phone: '01711000019',
    channel: 'website',
    channel_handle: null,
    interest: 'unclear',
    kind: 'job_seeker',
    summary: 'Looking for an AI intern role and asking where to apply.',
    suggested_reply:
      'Hi Arif, thanks for your interest. We will share the application process with you shortly.',
    reply_language: 'en',
    needs_attention: false,
  },
};

function fingerprint(message: string): string {
  return message.trim().replace(/\s+/g, ' ').toLowerCase();
}

const FIXTURES_BY_FINGERPRINT = new Map(
  Object.entries(FIXTURES).map(([message, fixture]) => [fingerprint(message), fixture]),
);

export function mockFixtureFor(message: string): unknown | undefined {
  return FIXTURES_BY_FINGERPRINT.get(fingerprint(message));
}

/**
 * Last-resort canned answer for a message with no fixture. Clearly generic,
 * so nobody mistakes it for a real extraction, but complete enough that the
 * drafting flow still works while mock mode is on.
 */
function fallbackExtraction(message: string): unknown {
  const bangla = hasBengaliScript(message);
  const summary = message.replace(/\s+/g, ' ').trim().slice(0, 140);

  return {
    name: 'Unknown sender',
    company: null,
    job_title: null,
    phone: null,
    channel: 'whatsapp',
    channel_handle: null,
    interest: 'unclear',
    kind: 'unclear',
    summary: summary || 'No message text.',
    suggested_reply: bangla
      ? 'আপনার বার্তার জন্য ধন্যবাদ। আমরা শীঘ্রই আপনার সঙ্গে যোগাযোগ করব।'
      : 'Thanks for your message. We will get back to you shortly.',
    reply_language: bangla ? 'bn' : 'en',
    needs_attention: false,
  };
}

export function mockExtractionFor(message: string): unknown {
  return structuredClone(mockFixtureFor(message) ?? fallbackExtraction(message));
}

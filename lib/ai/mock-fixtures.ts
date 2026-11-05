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
    needs_attention: false,
  },

  'পেমেন্ট করেছি কিন্তু কোনো কনফার্মেশন পাইনি। আমার নাম ফারজানা রহমান। ২৫ তারিখে বিকাশে দিয়েছি।': {
    name: 'Farzana Rahman',
    company: null,
    job_title: null,
    phone: '01711000007',
    channel: 'whatsapp',
    channel_handle: null,
    interest: 'unclear',
    kind: 'support',
    summary: 'Says she paid via bKash on the 25th and received no confirmation.',
    suggested_reply:
      'ফারজানা আপু, আপনার পেমেন্টের বিষয়টি আমরা যাচাই করছি। দ্রুতই কনফার্মেশন জানাবো।',
    needs_attention: true,
  },

  'Do you offer refunds if I cannot attend after paying?': {
    name: 'Anika Chowdhury',
    company: null,
    job_title: null,
    phone: '01711000008',
    channel: 'website',
    channel_handle: null,
    interest: 'unclear',
    kind: 'sales_lead',
    summary: 'Asks about the refund policy if she cannot attend.',
    suggested_reply:
      'Hi Anika, thanks for asking. Our refund terms are {{refund_policy}}. We would be happy to walk you through them before you decide.',
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
    needs_attention: false,
  },

  "Apnader course certificate ta ki govt approved?": {
    name: 'Nowshin',
    company: null,
    job_title: null,
    phone: null,
    channel: 'facebook',
    channel_handle: null,
    interest: 'unclear',
    kind: 'sales_lead',
    summary: 'Asks whether the course certificate is government approved.',
    suggested_reply:
      'Hi Nowshin! Our certificate is {{certificate}}. Let us know if you have any other questions.',
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
    needs_attention: false,
  },

  'Called to ask about student discount. Said she will call again tomorrow after 5 PM.': {
    name: 'Nasreen Sultana',
    company: null,
    job_title: null,
    phone: '01711000005',
    channel: 'phone',
    channel_handle: null,
    interest: 'unclear',
    kind: 'sales_lead',
    summary:
      'Called about a student discount and will call back tomorrow after 5 PM.',
    suggested_reply:
      'Hi Nasreen, thanks for calling about the student discount. We will be ready for your call tomorrow after 5 PM.',
    needs_attention: false,
  },

  'Ei course korle job pabo?': {
    name: 'Ishtiaq',
    company: null,
    job_title: null,
    phone: null,
    channel: 'facebook',
    channel_handle: null,
    interest: 'unclear',
    kind: 'sales_lead',
    summary: 'Asks whether the course leads to a job.',
    suggested_reply:
      'Vai, ei course ta job er jonno skills prepare korte sahajjo kore. Apnar proshno gulor detail amra shiggiri janabo.',
    needs_attention: false,
  },

  'Offline class kothay hobe? Mirpur e?': {
    name: 'Jahid',
    company: null,
    job_title: null,
    phone: null,
    channel: 'facebook',
    channel_handle: null,
    interest: 'bootcamp',
    kind: 'sales_lead',
    summary: 'Asks where the offline class will be held, mentioning Mirpur.',
    suggested_reply:
      'Vai, offline class er location {{location}}. Exact venue amra shiggiri janabo.',
    needs_attention: false,
  },

  "Hi, I'm from a bank in Motijheel. Need a quote for training 120 employees. Online or onsite both fine.": {
    name: 'Kamrul Islam',
    company: 'a bank in Motijheel',
    job_title: 'HR',
    phone: '01711000010',
    channel: 'whatsapp',
    channel_handle: null,
    interest: 'corporate',
    kind: 'sales_lead',
    summary: 'A bank in Motijheel needs a quote for training 120 employees.',
    suggested_reply:
      'Hello Kamrul, thank you for reaching out. We can arrange training for your 120 employees, online or onsite. Could you share a good time to discuss the quote?',
    needs_attention: false,
  },

  'Bootcamp er price ta bolen please': {
    name: 'Rafi Ahmed',
    company: null,
    job_title: null,
    phone: '01711000001',
    channel: 'whatsapp',
    channel_handle: null,
    interest: 'bootcamp',
    kind: 'sales_lead',
    summary: 'Follows up asking for the bootcamp price.',
    suggested_reply:
      'Rafi, bootcamp er fee {{price}}. Payment er jonno {{payment_method}} use korte parben.',
    needs_attention: false,
  },

  'আমি ক্লাস ৯-এ পড়ি। আমি কি ফ্রি মাস্টারক্লাসে জয়েন করতে পারব?': {
    name: 'Mim',
    company: null,
    job_title: null,
    phone: null,
    channel: 'facebook',
    channel_handle: null,
    interest: 'fellowship',
    kind: 'sales_lead',
    summary: 'A class 9 student asks to join the free masterclass.',
    suggested_reply:
      'মিম, তুমি ফ্রি মাস্টারক্লাসে জয়েন করতে পারবে। কীভাবে জয়েন করবে আমরা শীঘ্রই জানাবো।',
    needs_attention: false,
  },

  'Is the fellowship suitable for a non-technical marketing manager? I have 8 years of experience but no coding.': {
    name: 'Shirin Sultana',
    company: null,
    job_title: null,
    phone: '01711000013',
    channel: 'website',
    channel_handle: null,
    interest: 'fellowship',
    kind: 'sales_lead',
    summary:
      'A non-technical marketing manager asks if the fellowship suits her.',
    suggested_reply:
      'Hi Shirin, yes — the fellowship is designed to welcome people from non-technical backgrounds. We would be glad to talk through how it fits your experience.',
    needs_attention: false,
  },

  'Add-on ta ki? Lifetime access mane ki?': {
    name: 'Tanvir',
    company: null,
    job_title: null,
    phone: '01711000014',
    channel: 'whatsapp',
    channel_handle: null,
    interest: 'bootcamp',
    kind: 'sales_lead',
    summary: 'Asks what the add-on is and what lifetime access means.',
    suggested_reply:
      'Tanvir, add-on ar lifetime access er detail amra shiggiri janabo.',
    needs_attention: false,
  },

  'Caller wants to cancel his enrolment and get his money back. Very upset. Said he will post about it on Facebook if not solved today.': {
    name: 'Habibur Rahman',
    company: null,
    job_title: null,
    phone: '01711000015',
    channel: 'phone',
    channel_handle: null,
    interest: 'unclear',
    kind: 'support',
    summary:
      'Wants to cancel and get a refund, threatening to post publicly.',
    suggested_reply:
      'Hello Habibur, I am sorry to hear this. We are looking into your cancellation and refund today and will contact you as soon as it is resolved.',
    needs_attention: true,
  },

  'আমার কোম্পানির ১৫ জন কর্মীর জন্য কি গ্রুপ ডিসকাউন্ট আছে?': {
    name: 'Rezaul Karim',
    company: 'small garment factory',
    job_title: 'owner',
    phone: '01711000017',
    channel: 'whatsapp',
    channel_handle: null,
    interest: 'corporate',
    kind: 'sales_lead',
    summary:
      'Owner of a small garment factory asks about a group discount for 15 staff.',
    suggested_reply:
      'রেজাউল করিম, আপনার কোম্পানির ১৫ জন কর্মীর জন্য গ্রুপ ডিসকাউন্টের বিষয়টি আমরা জানিয়ে দেবো। {{discount}} সম্পর্কে বিস্তারিত শীঘ্রই জানাবো।',
    needs_attention: false,
  },

  'Can I pay in two instalments for the fellowship?': {
    name: 'Samira',
    company: null,
    job_title: null,
    phone: '01711000018',
    channel: 'whatsapp',
    channel_handle: null,
    interest: 'fellowship',
    kind: 'sales_lead',
    summary:
      'Asks whether the fellowship fee can be paid in two instalments.',
    suggested_reply:
      'Hi Samira, yes — the fellowship can be paid in instalments. The exact plan is {{instalments}}, and we can walk you through it.',
    needs_attention: false,
  },
};

function fingerprint(message: string): string {
  return message.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * The eval and the seed paste a sender line ahead of the message, because the
 * sample CSV keeps that context in separate columns. The fixture table is
 * keyed by the message itself, so a leading `From:`/`Phone:`/`Channel:` block
 * is removed before lookup. A bare message still matches unchanged.
 */
function messageBody(message: string): string {
  const separator = message.indexOf('\n\n');

  if (separator !== -1 && /^From:\s/m.test(message.slice(0, separator))) {
    return message.slice(separator + 2);
  }

  return message;
}

const FIXTURES_BY_FINGERPRINT = new Map(
  Object.entries(FIXTURES).map(([message, fixture]) => [fingerprint(message), fixture]),
);

export function mockFixtureFor(message: string): unknown | undefined {
  return FIXTURES_BY_FINGERPRINT.get(fingerprint(messageBody(message)));
}

/**
 * Last-resort canned answer for a message with no fixture. Clearly generic,
 * so nobody mistakes it for a real extraction, but complete enough that the
 * drafting flow still works while mock mode is on.
 */
function fallbackExtraction(message: string): unknown {
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
    suggested_reply:
      'Thanks for your message. We will get back to you shortly.',
    needs_attention: false,
  };
}

export function mockExtractionFor(message: string): unknown {
  return structuredClone(
    mockFixtureFor(message) ?? fallbackExtraction(messageBody(message)),
  );
}

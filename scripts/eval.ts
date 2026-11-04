import { createExtractorFromEnv } from '@/lib/ai/extractor';
import {
  ExtractionValidationError,
  hasBengaliScript,
  validateExtraction,
  type ExtractionResult,
} from '@/lib/domain/extraction';
import { loadEnv } from './env';
import {
  SAMPLE_ENQUIRIES,
  expectationFor,
  formatSampleInput,
  type SampleEnquiry,
  type SampleExpectation,
} from './sample-data';

/**
 * Run every sample through the configured extractor and diff the result
 * against the frozen expectation.
 *
 * The eval talks to the same `AiExtractor` port and the same
 * `validateExtraction` guards the route uses, so a row that passes here is a
 * row the application would accept. It never writes to a database.
 *
 *   pnpm eval
 *
 * Exit code 0: all twenty rows matched. Exit code 1: at least one row differed,
 * or the extractor was unavailable. A mismatch is information, not something to
 * repair by loosening the expectation.
 */

loadEnv();

const extractor = createExtractorFromEnv();
const mockMode = process.env.MOCK_AI === '1';
const mode = mockMode
  ? 'mock (MOCK_AI=1 — fixed fixtures, not a model measurement)'
  : process.env.OPENROUTER_MODEL
    ? `openrouter:${process.env.OPENROUTER_MODEL}`
    : 'unconfigured (no MOCK_AI and no OPENROUTER_MODEL)';

function preview(value: unknown): string {
  if (value === null) return 'null';

  if (typeof value === 'string') {
    const singleLine = value.replace(/\s+/g, ' ').trim();
    return singleLine.length > 84
      ? `"${singleLine.slice(0, 81)}…"`
      : `"${singleLine}"`;
  }

  return String(value);
}

function textMismatch(
  field: string,
  actual: string | null,
  expected: string | null,
): string[] {
  if (expected === null) {
    return actual === null ? [] : [`${field}: expected null, got ${preview(actual)}`];
  }

  if (
    typeof actual === 'string' &&
    actual.trim().toLowerCase() === expected.trim().toLowerCase()
  ) {
    return [];
  }

  return [`${field}: expected ${preview(expected)}, got ${preview(actual)}`];
}

function patternMismatch(
  field: string,
  actual: string | null,
  pattern: RegExp,
): string[] {
  if (typeof actual === 'string' && pattern.test(actual)) return [];
  return [`${field}: expected to match ${pattern}, got ${preview(actual)}`];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compare(
  sample: SampleEnquiry,
  expectation: SampleExpectation,
  raw: unknown,
  result: ExtractionResult,
): string[] {
  const mismatches: string[] = [];

  if (isRecord(raw) && Object.keys(raw).some((key) => key.toLowerCase() === 'status')) {
    mismatches.push('status: extraction must not return a status key');
  }

  mismatches.push(
    ...textMismatch('kind', result.kind, expectation.kind),
    ...textMismatch('interest', result.interest, expectation.interest),
    ...textMismatch(
      'reply_language',
      result.reply_language,
      expectation.replyLanguage,
    ),
    ...textMismatch('name', result.name, expectation.name),
    ...textMismatch('phone', result.phone, sample.phone),
    ...textMismatch('channel', result.channel, sample.channel),
  );

  if (expectation.companyPattern) {
    mismatches.push(
      ...patternMismatch('company', result.company, expectation.companyPattern),
    );
  } else {
    mismatches.push(
      ...textMismatch('company', result.company, expectation.company),
    );
  }

  mismatches.push(
    ...textMismatch('job_title', result.job_title, expectation.jobTitle),
  );

  if (result.needs_attention !== expectation.needsAttention) {
    mismatches.push(
      `needs_attention: expected ${expectation.needsAttention}, got ${result.needs_attention}`,
    );
  }

  if (result.summary.trim() === '') {
    mismatches.push('summary: expected a one-line summary, got an empty string');
  }

  if (expectation.reply === 'none') {
    if (result.suggested_reply !== null) {
      mismatches.push(
        `suggested_reply: expected null, got ${preview(result.suggested_reply)}`,
      );
    }
  } else if (result.suggested_reply === null || result.suggested_reply.trim() === '') {
    mismatches.push('suggested_reply: expected a reply, got null');
  } else if (
    expectation.replyLanguage === 'bn' &&
    !hasBengaliScript(result.suggested_reply)
  ) {
    mismatches.push(
      'suggested_reply: a Bengali-script message must receive Bengali script',
    );
  }

  return mismatches;
}

type RowOutcome = {
  sample: SampleEnquiry;
  mismatches: string[];
};

async function runRow(sample: SampleEnquiry): Promise<RowOutcome> {
  const expectation = expectationFor(sample.id);
  const input = formatSampleInput(sample);
  let raw: unknown;

  try {
    raw = await extractor.extract(input);
  } catch (error) {
    return {
      sample,
      mismatches: [
        `extractor: ${error instanceof Error ? error.message : 'unknown failure'}`,
      ],
    };
  }

  try {
    const result = validateExtraction(raw, input);
    return {
      sample,
      mismatches: compare(sample, expectation, raw, result),
    };
  } catch (error) {
    if (error instanceof ExtractionValidationError) {
      return {
        sample,
        mismatches: error.issues.map((issue) => `contract: ${issue}`),
      };
    }

    throw error;
  }
}

function describe(sample: SampleEnquiry): string {
  const expectation = expectationFor(sample.id);

  return [
    String(sample.id).padStart(2, '0'),
    expectation.kind.padEnd(11),
    expectation.interest.padEnd(10),
    expectation.replyLanguage.padEnd(8),
    expectation.name.padEnd(18),
  ].join('  ');
}

async function main(): Promise<void> {
  console.log('BIAI extraction eval');
  console.log(`extractor: ${mode}`);
  console.log(`rows: ${SAMPLE_ENQUIRIES.length}`);
  if (mockMode) {
    console.log(
      'note: mock mode returns the canned fixture table. A pass proves the harness, not the model.',
    );
  }
  console.log('');

  let failures = 0;

  for (const sample of SAMPLE_ENQUIRIES) {
    const outcome = await runRow(sample);
    const passed = outcome.mismatches.length === 0;

    if (!passed) failures += 1;

    console.log(`${passed ? 'PASS' : 'FAIL'}  ${describe(sample)}`);

    for (const mismatch of outcome.mismatches) {
      console.log(`        ${mismatch}`);
    }
  }

  const passed = SAMPLE_ENQUIRIES.length - failures;

  console.log('');
  console.log(`${passed}/${SAMPLE_ENQUIRIES.length} rows passed.`);

  if (failures > 0) {
    console.error(`${failures} row(s) failed the frozen expectation.`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(
    `[eval] ${error instanceof Error ? error.message : 'eval failed.'}`,
  );
  process.exitCode = 1;
});

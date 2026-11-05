# BIAI CRM

A small internal CRM for BIAI, an AI training company in Bangladesh. It captures enquiries that
arrive by WhatsApp, Facebook, the website and phone calls, turns a pasted message into an editable
proposal, and shows the sales pipeline and the people who have gone quiet.

The system is deliberately plain: one Next.js application, one Postgres database, no login, no
background jobs. It is built to be run by the team behind the company's existing access controls.

## What it does

| Screen | What it is for |
| --- | --- |
| **Capture** (`/`) | Paste a message, then type the details yourself or have AI propose them. **Read message** fills the enquiry details only; the Reply box is drafted separately by **Generate reply**, then edited and copied at any point. Correct anything wrong and save; the original message is kept byte for byte. |
| **Pipeline** (`/pipeline`) | Five columns — New, Contacted, Interested, Paid, Lost — containing genuine sales leads only. Move a card, append a note, flag it for attention. |
| **Follow-ups** (`/follow-ups`) | Sales leads in New or Contacted whose last contact (or creation) is at least 48 hours old, oldest first. |
| **List** (`/enquiries`) | Every enquiry of every kind, filterable by status and kind. This is where spam, job seekers and support threads remain findable. |
| **Summary** (`/summary`) | A seven-day count from the database plus a written narration. The model writes only prose around `{{token}}` placeholders; the server fills every number. |

## Run it

Requirements: Node 20+, pnpm, and a Postgres database (the project's own environments use two Neon
branches — testing and production).

```bash
pnpm install
cp .env.example .env.local     # then fill in the URLs and choose a mode
pnpm db:push:test              # create the schema on the testing branch
pnpm db:seed --target test     # optional: the 20 sample enquiries
pnpm dev                        # http://localhost:3000
```

Use a different port without the `pnpm --` forwarding trap:

```bash
./node_modules/.bin/next dev -p 3100
```

### AI modes

The whole application follows one setting, resolved in `lib/ai/availability.ts`:

| Mode | How to select it | What happens |
| --- | --- | --- |
| **Live** | `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` set, `MOCK_AI=0` | Extraction, reply generation and the weekly narration call OpenRouter. |
| **Mock** | `MOCK_AI=1` | Canned fixtures keyed to the sample messages. No network call, no spend. A banner says the AI is in mock mode, so canned text is never presented as a live answer. This is the safe local default during development. |
| **Unavailable** | `MOCK_AI=0` and no key/model | The app loads normally. A banner says AI is unavailable, **Read message** and **Generate reply** are disabled, and the details form and reply box are still fully editable by hand and save an enquiry. `/summary` shows its counts without prose. |

Try the no-key path with the environment overriding `.env.local`:

```bash
MOCK_AI=0 OPENROUTER_API_KEY= OPENROUTER_MODEL= ./node_modules/.bin/next dev -p 3100
```

`POST /api/extract` answers `503 { "error": "ai_unavailable" }` in that mode; the screen explains
that manual entry remains available rather than leaving a spinner running.

### Database branches

`DATABASE_BRANCH` selects the connection string: `testing` uses `TEST_DATABASE_URL`, `production`
uses `DATABASE_URL`. With no branch configured, a process holding both variables uses production,
and one holding only `DATABASE_URL` is production too. The label the app reports is derived from
the URL it actually opened, so a process can never read production while claiming to be testing;
an explicit label without its matching URL fails loudly. The production branch holds the schema and
no seed data. The seed script refuses to run unless the target is explicitly `test`, and refuses
when the two URLs resolve to the same database. `pnpm db:verify` reports table presence and row
counts for both branches; only production must hold zero rows, because the testing branch is
normally seeded.

### Other commands

```bash
pnpm typecheck    # tsc --noEmit
pnpm test         # Vitest; route tests use TEST_DATABASE_URL and roll back
pnpm build        # production build
pnpm eval         # all 20 samples through the configured extractor and validator
```

`pnpm eval` prints one PASS/FAIL line per sample and exits non-zero on any mismatch. With
`MOCK_AI=1` it checks the harness and fixtures, not model quality; with a real key and model it is
the measurement.

## How it is put together

```
app/                     Next.js App Router pages and thin route bindings
  api/                   one file per endpoint, delegating to lib/api
  capture-form.tsx       the only interactive form (client component)
  enquiries/             the list, plus one enquiry's detail view and reply panel
  pipeline/              board page plus its client board
lib/
  domain/                pure, I/O-free decisions (no database, no network)
  api/                   request handlers with injected database / AI ports
  ai/                    extractor and narrator ports, OpenRouter clients, fixtures
  db/                    Drizzle schema, branch resolution, one connection pool
  format.ts, log.ts      presentation copy and the single server failure line
scripts/                 schema push/verify, seed, eval
tests/                   the two seams: pure domain + HTTP routes
```

The `AiExtractor` and `SummaryNarrator` are plain interfaces. The route tests replace them with
fakes; `MOCK_AI` replaces them with fixtures; the page and route never know which one they have.
The database is injected into handlers for the same reason: a test passes a transaction and rolls
it back.

## Decisions

These are the decisions worth knowing before changing the system.

- **A save is a reviewed proposal, not an autosave.** AI fills a form; a human edits it; only then
  is a row written. Nothing is stored by `/api/extract` or `/api/reply`, so a bad extraction costs a
  retry, not a bad record.
- **Manual capture is a first-class path, not an error state.** The details form is always open, so
  an operator can type every field without an AI request; **Read message** is an optional autofill
  of the details. The original message is still required, because a row without its source is
  evidence-free. Extraction asks before replacing details already typed by hand, and it leaves the
  reply box untouched.
- **Reply drafting is a separate AI action.** **Read message** extracts identity and classification
  only. **Generate reply** is the one AI path that writes the reply box; it takes the pasted message
  and nothing else.
- **Status is human-owned.** Extraction never returns a status, a save writes `new` unless the operator ticks Contacted (which requires a reply), and
  only `PATCH /api/enquiries/:id` moves a card. `paid` is a human assertion, not a payment event.
- **Nothing important is only on the capture screen.** The list row is a summary, but
  `/enquiries/:id` keeps the original message verbatim, the single editable reply, and every note in
  order. The reply is editable there, because it often changes once the price or start date is
  known, and the text actually sent should outlive the tab it was typed in.
- **Notes are written where the move happens.** A note is appended from the board and read back on
  the enquiry; it is attached to one enquiry and never edited.
- **Leaving New is the contact moment.** `applyStatusChange` stamps `last_contacted_at` only when a
  card leaves `new`; later moves keep the first contact time. Stamping every move would let marking
  a card Lost reset the 48-hour clock it is meant to measure.
- **The 48-hour rule is inclusive.** The cutoff is `now - 48h` and the comparison is `<=`, using
  `coalesce(last_contacted_at, created_at)`. A lead at exactly 48 hours is in the queue.
- **Non-leads are excluded in SQL, before any view logic.** The pipeline, follow-up queue and
  summary's lead counts filter `kind = 'sales_lead'` in the query. The list deliberately does not,
  so support and spam remain findable without polluting the board.
- **Duplicates warn; they never block.** A repeat phone number returns the earliest matching
  enquiry in `duplicateOf`. Both rows are kept, because a repeat message may be a second deal or a
  different person sharing a phone.
- **Replies use placeholders instead of invented facts.** The prompt restricts the model to nine
  tokens, and the operator is warned about every surviving placeholder before copying. Generated
  replies are used as the model wrote them; the allowlist is enforced when an operator edits a reply.
  Capture and detail each show one editable reply box; **Generate reply** drafts only that box. The
  summary follows the same rule: the model may use only `{{received}}`-style count tokens, and the
  server renders them from the same facts it computed.
- **The AI matches the reply language inside the prompt.** The prompt asks the model to evaluate the
  message first — Bangla, Banglish or English — then write the reply in that same language. Language
  is never returned, stored, or shown as a field; there is no deterministic script check and no
  manual language selector. The model's reply text is used as written.
- **AI failure is visible, not silent.** Missing configuration produces a banner and a 503; a
  provider failure produces a 502 with a message. Manual capture and every database screen work
  without AI.
- **One model from configuration.** `OPENROUTER_MODEL` is a setting, never a constant, and there is
  no fallback chain. `MOCK_AI=1` wins over a configured key so a local session cannot spend a
  request by accident.
- **One timeout from configuration.** `OPENROUTER_TIMEOUT_MS` is the per-attempt ceiling for every
  AI call — extraction, reply generation and the weekly summary — and defaults to 45 s when unset.
  It is a setting for the same reason the model is: a reasoning phase on a slow or local model can
  run longer than a hosted free model allows. The single retry still applies, so the worst case is
  two ceilings plus the 750 ms backoff.
- **Thinking is off for every AI call.** The request carries
  `chat_template_kwargs: { enable_thinking: false }`, so a reasoning model answers instead of
  spending the token budget and the timeout on a phase nobody reads. The flag belongs inside
  `chat_template_kwargs`: the local MLX server ignores a top-level `enable_thinking`.
  Hosted OpenRouter is the exception. Its parameter list is `reasoning`, `reasoning_effort` and
  `include_reasoning`, and it allows the extra field without error, so calls against OpenRouter
  still succeed — but `chat_template_kwargs` is inert there and thinking stays at the model's
  default. On that endpoint the switch is `reasoning: { effort: "none" }`, which models whose
  reasoning is mandatory reject; the token budgets and timeout, not the flag, protect those calls.

## Deliberate cuts

The following are out of scope for v1, not oversights:

- Authentication, accounts, roles, per-user attribution and multi-tenancy. The app sits behind the
  company's existing access controls, and notes are unattributed because there is no user to
  attribute them to.
- Conversation threads. A repeat message is a separate enquiry; the duplicate warning is the only
  concession.
- Bulk CSV import, file upload and live ingestion from WhatsApp, Facebook or the website. The
  twenty samples are loaded by a seed script into the testing branch; real messages are pasted by
  hand.
- Payment verification, invoicing and gateway integration. "Paid" is a person's assertion.
- Edit history or an audit log beyond the notes table.
- Rich text, attachments, images and voice notes in the raw message.
- Internationalisation, theming, dark mode and a dedicated mobile layout.
- Analytics beyond the weekly summary, and AI features beyond the listed fields — no sentiment,
  lead scoring or revenue forecasting.
- A price list, cohort calendar or policy knowledge base. The system does not know the answers, so
  replies carry placeholders instead.
- Automated deployment pipelines, observability and error tracking.
- Model benchmarking or fallback chains across providers.

## Trade-offs and known gaps

- **Free-model throttling is real.** OpenRouter's free models can queue, rate-limit or disappear.
  The mitigations present are a visible banner, mock mode and a clear failure response. There is
  **one retry with backoff on 429 and 5xx, then no further loop**; a repeated failure is a visible
  502 the operator can retry, never a partial write.
- **No real-model evaluation was possible in this environment.** `.env.local` has `MOCK_AI=1` and
  no key. `pnpm eval` reports 20/20 against fixtures; that is a harness check, not a claim about
  model quality. With a real key and model, the same command becomes the measurement. The frozen
  expectations live in the eval script for exactly that comparison.
- **Structured output can drift.** A model that wraps JSON in prose or emits a forbidden field is
  rejected by Zod; an unparseable answer is a failed extraction, not a repaired row. That means a
  valid message can fail, and the operator falls back to manual entry.
- **Remote Postgres adds latency.** Neon free-tier cold starts can add a second or two to the
  first query. Pages are server-rendered and show no artificial spinner; the capture button is the
  only place with an explicit "Reading…" state, and Save stays disabled until the form is
  populated.
- **Placeholder fatigue is a prompting problem, not a UI one.** The prompt limits a placeholder to
  a fact the message actually asks about, but a model can still over-use them. The form names every
  surviving token and refuses a silent copy, so the cost is visible rather than shipped.
- **The sample dates are fixed.** Seeded rows keep their original 2026-10-26/27 timestamps. When
  reviewed later, the summary's seven-day `received` and `moved` counts can read zero while
  `stuck` and `leads_by_status` stay populated. That is the honest result of the data, not a bug.
- **No auth is a deliberate perimeter choice.** Anyone who can reach the app can read and change
  everything. Deploy it only behind the company's existing access controls.

## Testing

Tests live at two seams only:

1. **The pure domain module** (`lib/domain/*`) — extraction and reply validation, the placeholder
   allowlist, status transitions, the 48-hour decision and summary narration. No database,
   no network.
2. **The HTTP routes** (`lib/api/*` with real handlers) — the wiring a pure suite cannot see: one
   insert per save, status forced to `new`, non-leads excluded from the board and queue, duplicate
   reporting, reply-only generation, AI failure codes. Database tests run inside transactions that
   roll back.

Nothing is tested through the UI, and the AI is always replaced by a fake or a fixture. The enquiry
detail page and its reply panel add no third seam: the panel PATCHes the same endpoint the board
uses. If a refactor moves code without changing observable behaviour, no test should need to change.

## Sample data

`sample-enquiries.csv` contains twenty fictional enquiries in Bangla, Banglish and English from
WhatsApp, Facebook, the website and phone notes. They include real sales enquiries, support issues,
spam, and a job seeker. `pnpm db:seed --target test` loads them with their original timestamps and
demo statuses across all five columns; the seed verifies the board, queue and summary counts after
writing. `sample-enquiries.csv` is the source of truth for the eval expectations as well.

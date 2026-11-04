# Progress

All seven tickets are complete and their files have been retired. This document remains as the
handoff history; `README.md` is the handover document.

## Frontier

Handover is complete; there is no next ticket. S7 was a post-handover review pass and is recorded
below.

| Card | Ticket                    | Blocked by | Done |
| ---- | ------------------------- | ---------- | ---- |
| S0   | 01-foundation             | —          | [x]  |
| S1   | 02-extraction             | 01         | [x]  |
| S2   | 03-capture-and-save       | 02         | [x]  |
| S3   | 04-pipeline               | 03         | [x]  |
| S4   | 05-follow-up-and-summary  | 04         | [x]  |
| S5   | 06-test-data-and-eval     | 04         | [x]  |
| S6   | 07-hardening-and-handover | 05, 06     | [x]  |

## Handoff log

Newest first. One entry per session, in this shape:

```
### S<n> — <title> — <date>
- Done:
- Verified:
- Not done:
- Traps hit:
- Next:
```

### S7 — Review fixes — 2026-11-04

- Done: a `/code-review` pass since the empty tree reported 16 findings; all are fixed. Standards:
  the health check moved out of `app/api` into `lib/api/health.ts` behind an injected port (the route
  is a binding and the handler now has tests); `POST /api/extract` logs through `logFailure` instead
  of three bespoke `console.error` calls; one OpenRouter client (`lib/ai/openrouter.ts`) owns the
  request, timeout, envelope and the spec's single 429/5xx retry for both extraction and narration;
  one placeholder scanner (`lib/domain/placeholders.ts`) replaces three copies, matching tokens
  literally in replies and in the narration; the duplicate-phone warning renders in `Asia/Dhaka` via
  `formatDateTime`; `db-push` and `db-verify` are TypeScript scripts sharing the `lib/db/branch.ts`
  guards (`databaseIdentity`/`sameDatabase`) instead of comparing raw strings; the board, the seed's
  queue check and the test harness use the domain clock and the normalised identity; the four
  server-rendered pages share one load/error path (`lib/api/page-load.ts` + `PageLoadError`) and the
  three JSON handlers share one body parser (`lib/api/request-body.ts`). Spec:
  `PATCH /api/enquiries/:id` now accepts `suggested_reply` and `reply_filled`, so a reply can be
  filled and copied after save, and a new `/enquiries/[id]` detail view shows the original message
  verbatim, the reply template beside its filled text and the note history (the board and the list
  link to it); `MOCK_AI=1` renders a mock-mode banner; the branch label is derived from the URL
  actually opened (a `DATABASE_URL`-only process reports production; an explicit label without its
  URL fails loudly); `updated_at` is stamped only on a status move, so the summary's `moved` count is
  no longer inflated by notes or reply edits; `db:verify` requires zero rows only on production.
  SPEC corrected where it contradicted the tickets: the 48-hour comparison is inclusive, and six
  samples (not five) carry no phone (#9 included).
- Verified: `tsc --noEmit` clean; `vitest run` 177 passed; `next build` clean with `/enquiries/[id]`
  in the route table; `tsx scripts/db-verify.ts` reports testing 20/0 and production 0/0; live on
  3110 the mock banner rendered, `/enquiries/<id>` showed the original message and reply panel, a
  reply PATCH persisted and left `updated_at` untouched, an unallowlisted token returned 422, and
  the row was restored unchanged.
- Not done: still no real-model eval (no OpenRouter key here), so 20/20 remains a fixture check. No
  browser automation: the reply panel was exercised through the same PATCH the UI calls, not by
  clicking.
- Traps hit: the session started read-only, so Vitest could not write `node_modules/.vite-temp` until
  the file policy was widened; the first write is a human approval, not a code error. `tsx` resolves
  the `@/` alias for scripts, which is why the plain-Node `.mjs` scripts could disappear. A reply
  edit deliberately drops a stale `reply_filled` when the template changes without one supplied: the
  old finished text answered the old wording.
- Next: handover. With a real key and model, run `pnpm eval`; if the project continues, add a browser
  test for the capture and reply flows.

### S6 — Hardening & handover — 2026-11-04

- Done: one AI-mode resolver (`lib/ai/availability.ts`: live / mock / unavailable) now drives the
  extractor, the narrator and a global banner. Without a key the layout says AI is unavailable, the
  Capture screen disables **Read message** and offers **Fill in manually**, which opens the same
  reviewed form with an empty draft and a still-editable original message; saving, the board, the
  queue and the list never touch AI. Empty states now cover every view: Capture before a proposal,
  the pipeline with no sales leads, the list with no rows (separated from "no matches"), the summary
  with no arrivals and no leads, and the follow-up queue's existing "nobody forgotten" panel now
  names the empty-board case. `README.md` is a handover document: run instructions, AI modes,
  architecture, the decisions and the reason for each, the deliberate out-of-scope cuts, the
  trade-offs and known gaps, the two testing seams, and the sample data. One new route-seam test
  proves the real `/api/extract` binding loads and answers 503 with no key; 159 tests,
  `pnpm typecheck` and `pnpm build` clean.
- Verified: on 3106 with `MOCK_AI=0` and empty key/model, `/`, `/pipeline`, `/follow-ups`,
  `/enquiries`, `/summary` and `/api/health` all returned 200, the banner read "AI is unavailable.",
  the Read button was disabled, `POST /api/extract` returned 503 `ai_unavailable`, and `/summary`
  showed its counts with the narration-unavailable notice. A manual-style `POST /api/enquiries`
  (no AI involved) returned 201 and the row appeared in `/api/enquiries?status=new` and
  `/api/pipeline`; the verification row was then deleted and `/api/health` reported the seeded
  testing branch back at enquiries=20, notes=0. On 3107 against the empty production branch,
  every page returned 200 and each empty state's text was present. After the final edits:
  `pnpm test` 159 passed, `tsc --noEmit` clean, `next build` clean.
- Not done: no real-model eval — the environment still has no OpenRouter key, so 20/20 remains a
  fixture check. There is no automated browser test; the manual flow was exercised through the
  same endpoint the form posts to and its buttons were checked in the rendered HTML. There is no
  retry/backoff around OpenRouter; a provider failure is a visible 502 and the README records the
  gap.
- Traps hit: `.env.local` sets `MOCK_AI=1`, so a no-key check must override it from the shell
  (`MOCK_AI=0 OPENROUTER_API_KEY= OPENROUTER_MODEL=`). The root layout was statically rendered at
  build time, which would have baked the banner state into the build; `dynamic = 'force-dynamic'`
  keeps the AI mode a fact about the running process. Manual entry still requires the original
  message, because the API refuses to save evidence-free rows; the form now says so and disables
  Save while it is empty.
- Next: handover. If the project continues, run `pnpm eval` with a real key and model, and consider
  one retry with backoff for free-model throttling.

### S5 — Test data & eval — 2026-11-04

- Done: `scripts/seed.ts` (`pnpm db:seed --target test`) reads `sample-enquiries.csv` with a
  quoted-field parser, inserts all twenty rows with their 2026-10-26/27 Asia/Dhaka timestamps, and
  refuses to run unless the target is explicitly `test` and differs from `DATABASE_URL`. The pure
  guard `resolveSeedTarget` in `lib/db/branch.ts` also refuses `--target production`,
  `DATABASE_BRANCH=production`, a missing production URL and a test URL that normalises to the
  production one (credentials, query and trailing slash ignored); six new tests cover it. Demo
  statuses populate all five board columns (16 leads: New 8, Contacted 4, Interested 2, Paid 1,
  Lost 1), the queue (12 New/Contacted sales leads, all overdue) and the summary's
  `stuck`/`leads_by_status` counts. The seed verifies those three views after writing and exits
  non-zero if any count is wrong; a non-empty branch needs `--reset`. `scripts/eval.ts`
  (`pnpm eval`) runs all twenty samples through the configured `AiExtractor` and
  `validateExtraction`, diffs kind/interest/reply_language plus name/phone/channel/company/role/
  attention and reply presence/language against the frozen expectation, prints one PASS/FAIL line
  per row with mismatch details, and exits 1 on any mismatch. Mock fixtures now cover all twenty
  samples (lookup strips the eval's sender header); #7, #8 and #17's interest was corrected to
  `unclear` against the frozen table. The route test harnesses clear the table inside their
  rollback transactions now that the testing branch holds demo rows. 158 tests (6 new),
  `pnpm typecheck` and `pnpm build` clean.
- Verified: all four guard refusals exit 1 (no target, `--target production`, identical
  `TEST_DATABASE_URL`/`DATABASE_URL`, `DATABASE_BRANCH=production`). `pnpm db:seed --target test`
  inserted 20 rows; a direct query reports testing oldest `2026-10-26T03:12:00Z`, newest
  `2026-10-27T10:00:00Z`, production 0 rows. Live on 3105 against the seeded branch:
  `/api/pipeline` 16 (New 8, Contacted 4, Interested 2, Paid 1, Lost 1), `/api/reminders` 12,
  `/api/summary` facts stuck 12 and leads_by_status 16, and `/`, `/pipeline`, `/follow-ups`,
  `/summary`, `/enquiries` all 200. `pnpm eval` printed `20/20 rows passed.` and exited 0; with
  `MOCK_AI=0` and no key it printed `0/20 rows passed.` and exited 1. `pnpm test` 158 passed with
  the seeded branch in place.
- Not done: no real-model eval was possible — `.env.local` has `MOCK_AI=1` and no
  `OPENROUTER_API_KEY`. The 20/20 is a harness check, not a claim about model quality; with a real
  key and model configured, the same command becomes the measurement.
- Traps hit: the fixed sample dates (2026-10-26/27) are outside the summary's seven-day window when
  reviewed after 2026-11-03, so `received` and `moved` read 0 while `stuck=12` and
  `leads_by_status=16` are populated. Moving the sample timestamps to make the week look fuller
  would break the ticket's "original timestamps"; the zeros are the honest result. The eval gives
  each row a `From:`/`Phone:`/`Channel:` header because the CSV keeps those beside the message, not
  inside it; mock fixture lookup strips that header. `tsx` is now an explicit devDependency (it was
  already in the lockfile through Vitest) so the two TypeScript scripts do not rely on a transitive
  binary. Seeded rows keep `suggested_reply` empty because none of the three seeded views renders a
  reply.
- Next: start S6 — Hardening & handover (`07-hardening-and-handover.md`).

### S4 — Follow-up & Summary — 2026-11-04

- Done: `GET /api/reminders` returns sales leads in New or Contacted whose
  `coalesce(last_contacted_at, created_at)` is at least 48 hours old, oldest first. The exclusions
  (`kind = 'sales_lead'`, `status in ('new','contacted')`) are in the SQL before the time test, so
  spam, job seekers, support, unclear messages, Paid and Lost never reach the client. `/follow-ups`
  renders the queue with the waiting-since clock and age. `POST /api/summary` computes a seven-day
  aggregate in SQL (received, received_by_kind, moved, stuck, leads_by_status) and asks an injected
  `SummaryNarrator` to narrate it; the model returns `{{token}}` placeholders and
  `renderSummaryNarration` fills them from the same facts, rejecting digits, unknown tokens or a
  narrative with no count. `/summary` shows the facts even when narration is unavailable. The pure
  modules are `lib/domain/follow-up.ts` (`isDueForFollowUp`, cutoff/basis) and `lib/domain/summary.ts`;
  the API is one module per endpoint (`reminders`, `summary`). 152 tests (26 new across the two
  seams); `pnpm typecheck` and `pnpm build` clean.
- Verified: live on port 3104 with `MOCK_AI=1` against the testing branch and seven temporary
  fixtures. `/api/reminders` returned 3 — the 72h creation, the 49h contact and the exactly-48h
  contact — and omitted the 1h-fresh, spam, job-seeker and paid rows. `/api/summary` returned
  received 5, moved 4, stuck 3, and the mock narrator rendered those exact numbers. Both pages
  returned 200. Fixtures were then deleted; `pnpm db:verify` reports both branches at enquiries=0,
  notes=0. After the final pass: `pnpm test` 152 green, `tsc --noEmit` clean, `next build` clean.
- Not done: no notification, email or scheduled job, per the ticket. The summary is generated when
  the page or endpoint is called, not on a timer.
- Traps hit: a raw `sql` fragment in Drizzle passes a `Date` parameter straight to postgres-js,
  which throws `ERR_INVALID_ARG_TYPE`; the cutoff and window are sent as ISO strings cast with
  `::timestamptz`. The ticket's boundary is inclusive ("at exactly 48h it is present"), so the SQL is
  `<= now - 48h` rather than the `<` shorthand in the spec. `stuck` reuses the queue's exact clock.
  The rendered timestamps now name `Asia/Dhaka` explicitly; only the display moves, the arithmetic
  stays in UTC. The route tests clear the table inside the rollback transaction, so the summary
  counts stay deterministic once ticket 06 seeds the branch.
- Next: start S5 — Test data & eval (`06-test-data-and-eval.md`).

### S3 — Pipeline — 2026-11-04

- Done: the board at `/pipeline` has the five columns New → Lost, per-column counts, and cards
  showing name, company, job title, interest, kind, a needs-attention flag and age since the last
  contact (from creation until someone is reached). `GET /api/pipeline` selects only
  `kind = 'sales_lead'` **in the query**, so spam, job seekers, support and unclear messages never
  reach the view. `PATCH /api/enquiries/:id` moves a card, appends a note and sets or clears the
  attention flag: leaving New stamps `last_contacted_at`, a later move keeps the time it already
  had, and a note or a flag on its own changes nothing else. The move and its note share one
  transaction, so a card cannot end up moved with its note missing. `GET /api/enquiries?status=&kind=`
  backs the list view at `/enquiries`, which deliberately shows every kind so a support thread or
  job seeker can be found outside the board. The pure module gained `applyStatusChange`; the API
  is one module per endpoint (`enquiries`, `enquiry-list`, `enquiry-update`, `enquiry-dto`,
  `pipeline`), with one row-to-JSON mapper and one `logFailure` helper. 126 tests (29 new across
  the two seams); `pnpm typecheck` and `pnpm build` clean.
- Verified: live on port 3103 against the testing branch with five fixtures created through the
  API. The board showed 2 leads (New 1, Interested 1) and omitted the spam, job-seeker and support
  rows; moving a New card to Interested returned a fresh `last_contacted_at` and the note; a
  note-only update left the card in New with `last_contacted_at: null`; `?status=new&kind=sales_lead`
  returned Rafiq alone, `?kind=spam` returned the bot, and `?status=pending` returned 400. That
  live pass predates the review, so the card clock it saw as "In New for 3d" now reads
  "Created 3d ago". After the review: `pnpm test` 126 green — the route suite ran against the
  testing branch inside rollback transactions — and `tsc --noEmit` clean. Fixtures were then
  deleted; `pnpm db:verify` reports both branches at enquiries=0, notes=0.
- Not done: nothing in the ticket. The follow-up queue, weekly summary and seed data remain for
  S4/S5.
- Traps hit: the card clock is `COALESCE(last_contacted_at, created_at)` — the same basis the
  48-hour rule will use — and only leaving New stamps it. Stamping every move would let marking a
  card Lost reset the follow-up clock, so S4 must not reintroduce it. The route-test harness moved
  to `tests/support/database.ts` so the new suite reuses the rollback transaction rather than
  opening a second pattern. `PATCH` validates a UUID before querying so a malformed id is a clean
  404 rather than a Postgres cast error.
- Next: start S4 — Follow-up & Summary (`05-follow-up-and-summary.md`).

### S2 — Capture & Save — 2026-11-04

- Done: `POST /api/enquiries` saves one reviewed proposal as exactly one enquiry, always in
  `new`, preserves `raw_message` byte for byte, normalises the phone, and returns `duplicateOf`
  naming the earliest enquiry with the same phone without blocking the save. The pure module
  `lib/domain/enquiry.ts` holds `prepareEnquiry` (forces New, strips a client-sent status, keeps
  the template apart from `reply_filled`) and `replyToCopy` / `pendingPlaceholders` (copy the
  filled version; refuse while a `{{token}}` survives). The capture screen at `/` walks paste →
  extract → editable review → save, shows the duplicate warning with the earlier person's name,
  and warns instead of copying a placeholder. 97 tests (33 new across the two seams);
  `pnpm typecheck` and `pnpm build` clean.
- Verified: live on port 3103 with `MOCK_AI=1` against the testing branch. #17 extracted, saved
  as `new` with the message unchanged, the `{{certificate}}` template kept and the filled version
  stored. A second save whose phone was formatted differently returned `duplicateOf` naming the
  first while both rows persisted. A template saved without a filled version came back
  `reply_filled: null`, which `replyToCopy` refuses. `pnpm db:verify` afterwards: both branches
  zero rows.
- Not done: nothing in the ticket. `PATCH`, the board, reminders and the summary remain for S3/S4.
- Traps hit: the Docker daemon is not running, so there is no local Postgres; the route suite uses
  `TEST_DATABASE_URL` and wraps every test in a transaction that rolls back, leaving the testing
  branch untouched (important once ticket 06 seeds it). The capture screen imports `replyToCopy`
  from the same module as the Zod-validated save values, so Zod rides in that page's bundle;
  harmless now, worth splitting if bundle size matters later.
- Next: start S3 — Pipeline (`04-pipeline.md`).

### S1 — Extraction — 2026-11-04

- Done: `POST /api/extract` turns one pasted message into the 12-key extraction contract
  (`suggested_reply` is nullable), with no `status` key and no database access. The pure domain
  module `lib/domain/extraction.ts` holds `validateExtraction`, `hasBengaliScript`,
  `assertPlaceholdersAllowed`, `hasUnfilledPlaceholder` and `normalizePhone`: invalid nullable
  fields become null, an invented `{{token}}` voids the reply, and a Bangla-script message whose
  reply is not labelled `bn` and written in Bengali script comes back empty rather than in
  English. AI sits behind the injected `AiExtractor` port with an OpenRouter implementation and
  canned fixtures for `MOCK_AI=1`. 64 tests at the two seams (pure module + HTTP route);
  `pnpm typecheck` and `pnpm build` clean.
- Verified: live on port 3102 with `MOCK_AI=1`. #17 returned every field and no status; #3 split
  `Mahmud Hasan` / `Managing Director` / `Gazipur textile company`; #2 returned a Bengali reply
  with `phone: null`; #1 carried `{{price}}` and `{{payment_method}}` and no digits. `pnpm
  db:verify` before and after the calls reported both branches at enquiries=0, notes=0.
- Not done: nothing in the ticket. Screens, persistence and status changes remain out of scope
  for S2.
- Traps hit: Zod was missing from the scaffold, so 3.25.76 was added. `pnpm start -- -p 3102`
  forwards the `--` to Next, which then looks for a directory named `-p`; use
  `./node_modules/.bin/next start -p <port>`.
- Next: start S2 — Capture & Save (`03-capture-and-save.md`).

### S0 — Foundation — 2026-11-04

- Done: Next.js 16 App Router + TypeScript + Tailwind scaffold; Drizzle schema exactly as
  `docs/SPEC.md` (two tables, text enums with CHECK constraints, phone and status/kind indexes,
  cascade on notes); `GET /api/health` pings the database and returns `{ ok, db, tables }`;
  `db:push:test` / `db:push:prod` with a printed target and an identical-URL refusal;
  `db:verify`; one Vitest smoke assertion; `.env.example` documents every variable; `pnpm build`
  clean.
- Verified: both Neon branches (testing and production) carry `enquiries` and `notes`, both zero
  rows. `pnpm db:verify` passed. `/api/health` returned
  `{"ok":true,"db":"testing","tables":{"enquiries":0,"notes":0}}` on port 3100 and the same with
  `"db":"production"` on port 3101.
- Not done: nothing. The public-deployment item was removed from the ticket at the project
  owner's request; this session covers the running application and both database environments.
- Traps hit: the workspace had no git repository and no `pnpm`; pnpm was installed under
  `.tools/`. The provided Neon branches carried an older, incompatible empty schema
  (`enquiries` with an integer id, plus `messages` and `status_history`, with no `notes` table),
  so those empty objects were dropped and the specified schema was pushed. Port 3000 was already
  occupied by an unrelated application, so local checks used 3100/3101.
- Next: start S1 — Extraction (`02-extraction.md`).

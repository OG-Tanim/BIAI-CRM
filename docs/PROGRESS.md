# Progress

Seven tickets under `.scratch/biai-crm/issues/`. A ticket is next when every ticket in its "Blocked
by" is ticked here and in its own file.

## Frontier

Next: **06 — Test data & eval**

| Card | Ticket                    | Blocked by | Done |
| ---- | ------------------------- | ---------- | ---- |
| S0   | 01-foundation             | —          | [x]  |
| S1   | 02-extraction             | 01         | [x]  |
| S2   | 03-capture-and-save       | 02         | [x]  |
| S3   | 04-pipeline               | 03         | [x]  |
| S4   | 05-follow-up-and-summary  | 04         | [x]  |
| S5   | 06-test-data-and-eval     | 04         | [ ]  |
| S6   | 07-hardening-and-handover | 05, 06     | [ ]  |

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

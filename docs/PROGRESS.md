# Progress

Seven tickets under `.scratch/biai-crm/issues/`. A ticket is next when every ticket in its "Blocked
by" is ticked here and in its own file.

## Frontier

Next: **04 — Pipeline**

| Card | Ticket                    | Blocked by | Done |
| ---- | ------------------------- | ---------- | ---- |
| S0   | 01-foundation             | —          | [x]  |
| S1   | 02-extraction             | 01         | [x]  |
| S2   | 03-capture-and-save       | 02         | [x]  |
| S3   | 04-pipeline               | 03         | [ ]  |
| S4   | 05-follow-up-and-summary  | 04         | [ ]  |
| S5   | 06-test-data-and-eval     | 04         | [ ]  |
| S6   | 07-hardening-and-handover | 05, 06     | [ ]  |

## Handoff log

Newest first. One entry per session, in this shape:

```
### S<n> — <title> — <date>
- Done:
- Not done:
- Traps hit:
- Next:
```

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

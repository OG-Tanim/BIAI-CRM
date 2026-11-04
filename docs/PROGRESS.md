# Progress

Seven tickets under `.scratch/biai-crm/issues/`. A ticket is next when every ticket in its "Blocked
by" is ticked here and in its own file.

## Frontier

Next: **02 — Extraction**

| Card | Ticket                    | Blocked by | Done |
| ---- | ------------------------- | ---------- | ---- |
| S0   | 01-foundation             | —          | [x]  |
| S1   | 02-extraction             | 01         | [ ]  |
| S2   | 03-capture-and-save       | 02         | [ ]  |
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

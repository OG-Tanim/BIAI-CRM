# Implementation Plan — BIAI CRM

> **Status (2026-11-04):** all seven sessions are complete and the ticket files have been
> retired. This plan is kept as implementation history, not as pending work.

**Purpose.** Build `docs/SPEC.md` across several sessions, each starting with no memory of the conversation that produced it. The spec is the authority; this file is the order of work and the handoff contract.

**Sequencing.** Seven sessions, ordered by dependency rather than by time. Finish a card before starting the next.

---

## 0. How to run a session

Read, in this order, before touching code:

1. `docs/SPEC.md` — whole file the first session, only the sections the card names afterwards.
2. `docs/PROGRESS.md` — the checkbox state and the previous session's handoff note.
3. The card for this session, below.

Non-negotiables:

- **One session, one card.** Do not begin the next card, however much time feels left. Half-built next-card work is the most expensive kind of debt here.
- **Schema changes require a spec edit in the same session.** The spec's schema is the contract between sessions; an undocumented column is a bug in the plan.
- **Never write to the production branch. Never seed it.** Production ships with the schema and zero rows.
- **No authentication.** V1 is internal and trusts the team. Do not add a login "while you are in there".
- **No clock.** No card carries a deadline. Stop when its acceptance checks pass, not when an estimate says to.

Definition of Done — all five, every session:

1. `pnpm test` green.
2. `pnpm build` clean.
3. The session's feature works on the deployed URL, not only locally.
4. `docs/PROGRESS.md` updated: card checked, one-line handoff, anything surprising.
5. Commit `S<n>: <title>`.

---

## 1. Environment

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | Production Neon branch. Schema only, no rows, ever. |
| `TEST_DATABASE_URL` | Testing Neon branch. Seed and demo data live here and only here. |
| `OPENROUTER_API_KEY` | Server-side only. Never exposed to the browser. |
| `OPENROUTER_BASE_URL` | Defaults to the OpenRouter OpenAI-compatible endpoint. |
| `OPENROUTER_MODEL` | Free-tier model id. Configuration, never a constant. |
| `MOCK_AI` | When `1`, the extractor returns canned fixtures and makes no network call. |
| `NEXT_PUBLIC_APP_URL` | Used by the health check. |

The seed script takes an explicit `--target test` flag and refuse to run when the resolved connection string matches `DATABASE_URL`. That guard is not optional: a mistyped variable filling the live database with twenty fictional people is the worst mistake available in this design.

---

## 2. Dependency graph

```
S0 Foundation
  └─ S1 Extraction
       └─ S2 Capture & Save
            └─ S3 Pipeline
                 ├─ S4 Follow-up & Summary
                 └─ S5 Test data & eval
                      └─ S6 Hardening & handover
```

S4 and S5 both need S3 and are independent of each other. Everything else is a hard chain.

---

## 3. Session cards

### S0 — Foundation

**Goal.** A deployed skeleton that can talk to both database branches.

**Read.** SPEC: Architecture, Schema changes, Environments and seed data.

**Build.** Next.js App Router with TypeScript and Tailwind; Drizzle schema exactly as specified; `drizzle-kit push` to both branches; `GET /api/health` returning `{ ok: true, db: 'testing' }`; Vercel project wired to every variable in §1; `.env.example`.

**Acceptance.**

- Deployed `/api/health` returns 200 locally and in production.
- Both branches show the two tables; both have zero rows.
- `pnpm test` runs and passes one trivial assertion.

**Exit.** Deployed URL, schema on both branches, `.env.example` committed.

**Traps.** `drizzle-kit push` is the one command that can hit production by accident. Run it with the target variable printed first.

---

### S1 — Extraction

**Goal.** One message in, one validated prefill out, nothing written to the database.

**Read.** SPEC: Extraction contract, Reply placeholders, Reply language.

**Build.** The `AiExtractor` port; an OpenRouter adapter using `response_format: json_object`, one retry with backoff on 429/5xx; the prompt carrying all seven rules; the Zod schema with no `status` field; `validateExtraction`, `hasBengaliScript`, `assertPlaceholdersAllowed`, `hasUnfilledPlaceholder`; `POST /api/extract`; seam-1 unit tests.

**Acceptance.**

- `#1` → `phone: "01711000001"`, `interest: bootcamp`, reply contains `{{price}}` and `{{payment_method}}`, no `status` key.
- `#3` → `company: "Gazipur textile company"`, `job_title: "Managing Director"`, `name: "Mahmud Hasan"`.
- `#18` → `company: "small garment factory"`, `job_title: "owner"`.
- `#11` → `kind: spam`.
- `#2` → reply contains Bengali characters and `reply_language: "bn"`.
- A Bengali-script message answered in English yields `suggested_reply: null`.
- An invented token such as `{{cohort_two}}` nulls the reply.
- No row is written by any of the above.

**Exit.** Deployed `/api/extract`, tests green, `MOCK_AI` fixtures for at least #1, #2, #3, #11.

**Traps.** Free models sometimes wrap JSON in prose or a fenced block. Strip fences once; if it still will not parse, fail loudly. Never regex-repair a partial object into a valid one.

---

### S2 — Capture & Save

**Goal.** Paste → review → save, landing a row with `status: 'new'`.

**Read.** SPEC: API contracts, Status transitions, Schema changes.

**Build.** The capture page with editable fields; placeholder highlighting in the reply with a fill control; `POST /api/enquiries` forcing `status: 'new'`; the duplicate check returning `duplicateOf`; writing `reply_filled` separately from `suggested_reply`; the copy action with its unfilled-placeholder warning.

**Acceptance.**

- Saving creates exactly one row with `status: 'new'` and a populated `raw_message`.
- Re-saving the same phone returns `duplicateOf` naming the earlier enquiry, and the operator can still save.
- Saving with `{{price}}` still present succeeds; copying warns.
- Filling every placeholder writes `reply_filled` and the copy becomes clean.

**Exit.** Capture flow works end to end against the testing branch.

**Traps.** Two reply columns, not one. `suggested_reply` is the template; overwriting it with the filled text destroys the template and the warning.

---

### S3 — Pipeline

**Goal.** The board, over real rows.

**Read.** SPEC: User stories 21–27, 48; Status transitions; The 48-hour rule.

**Build.** `GET /api/pipeline`; the five-column board with counts and card age; `PATCH /api/enquiries/:id` for status, note and attention flag; `applyStatusChange` stamping `last_contacted_at`; list view with status and kind filters.

**Acceptance.**

- Moving a card updates `status` and stamps `last_contacted_at`.
- A note-only update does not move a deal or restamp contact time.
- `kind = spam` rows never appear on the board, enforced in SQL rather than in the component.
- Column counts match the rendered cards.

**Exit.** Board demoable on the deployed URL.

**Traps.** Filtering non-leads in the UI hides the bug until someone adds a second view. Filter in the query.

---

### S4 — Follow-up & Summary

**Goal.** The 48-hour queue and the AI weekly summary.

**Read.** SPEC: User stories 28–33, 37–41; The 48-hour rule; Status transitions.

**Build.** `isDueForFollowUp` plus its SQL; the queue page ordered by staleness; `POST /api/summary` computing a seven-day aggregate and asking the AI to narrate it; tests for the boundary and for the exclusions.

**Acceptance.**

- Queue excludes `spam`, `job_seeker`, `paid`, `lost`.
- An enquiry contacted 47h59m ago is absent; at 48h it is present.
- Summary counts match a hand-run SQL query on the same branch.

**Exit.** Both views live on the deployed URL.

**Traps.** Timezones. Store `timestamptz`, compare in UTC, render in `Asia/Dhaka`. A 48-hour window computed in local time silently shifts by six hours.

---

### S5 — Test data & eval

**Goal.** The testing branch looks like a working pipeline, and extraction quality is measurable.

**Read.** SPEC: Environments and seed data; Further Notes → Anomalies.

**Build.** The seed script honouring `--target test` and its production guard, inserting all 20 rows with the original timestamps; an eval script running all 20 messages through the extractor and diffing against the fixture table in §5, printing per-row pass/fail and exiting non-zero on any mismatch.

**Acceptance.**

- Seeding the testing branch populates the board, the queue and the summary.
- The seed script refuses to run when pointed at `DATABASE_URL`.
- The eval script reports 20 rows and its exit code is meaningful.

**Exit.** Branch seeded; eval output pasted into the handoff note.

**Traps.** The CSV has quoted fields containing commas — `"Mahmud Hasan (Managing Director, Gazipur textile company)"` breaks a naive `split(',')`. Use a real CSV parser.

---

### S6 — Hardening & handover

**Goal.** Shippable.

**Read.** SPEC: Known risks; Out of Scope.

**Build.** `MOCK_AI` banner and canned path; empty states for every view; a failure banner when OpenRouter throttles or the key is missing; the README covering decisions, deliberate cuts and trade-offs.

**Acceptance.**

- With no API key, the app loads, explains itself, and manual entry still works.
- Every view has a sane empty state.
- The README states the trade-offs made and what was deliberately not built.

**Exit.** Final deploy; README complete.

---

## 4. Story → session map

| Session | User stories |
|---|---|
| S0 | 47, 49 |
| S1 | 2, 9, 10, 12, 13–20, 42–45, 51, 53, 54 |
| S2 | 1, 3–8, 11, 34–36, 55, 56 |
| S3 | 21–27, 48 |
| S4 | 28–33, 37–41 |
| S5 | 46, 50 |
| S6 | 52 |

If a story has no home here, or a card builds something unlisted, stop and reconcile the spec before continuing.

---

## 5. Fixture expectations

Frozen for the eval harness. Judgement calls are marked — settle them once in S5, then never change them to make the model look good.

| Row | kind | interest | language | Note |
|---|---|---|---|---|
| 1 | sales_lead | bootcamp | banglish | |
| 2 | sales_lead | fellowship | bn | no phone |
| 3 | sales_lead | corporate | en | company + job_title |
| 4 | sales_lead | bootcamp | banglish | |
| 5 | sales_lead | unclear | en | staff note, judgement call |
| 6 | sales_lead | unclear | banglish | no phone |
| 7 | support | unclear | bn | never Paid |
| 8 | sales_lead | unclear | en | refund question |
| 9 | sales_lead | bootcamp | banglish | |
| 10 | sales_lead | corporate | en | company + job_title |
| 11 | spam | unclear | en | never on the board |
| 12 | sales_lead | bootcamp | banglish | duplicate of #1 |
| 13 | sales_lead | fellowship | bn | |
| 14 | sales_lead | fellowship | en | |
| 15 | sales_lead | bootcamp | banglish | |
| 16 | support | unclear | en | needs_attention |
| 17 | sales_lead | unclear | banglish | no phone |
| 18 | sales_lead | corporate | bn | company + job_title |
| 19 | sales_lead | fellowship | en | |
| 20 | job_seeker | unclear | en | not lost |

---

## 6. Cross-session risks

- **Schema drift.** Two sessions editing the schema without editing the spec produce an app no later session can reason about. The spec edit is the coordination mechanism.
- **Environment confusion.** Testing and production both exist from S0. Every script that writes must print its target before writing.
- **Free-model drift.** A model retired mid-build changes extraction behaviour without changing a line of code. Run the eval harness at the start of any session that touches extraction — it tells you whether the fault is yours or the model's.
- **Card creep.** If a card grows beyond its stated scope, stop at a green boundary, split the remainder into a new card, and record the split in `docs/PROGRESS.md`. Do not roll half a card into the next session.

---

## 7. Resume protocol

Starting cold, before reading the card:

1. `git log --oneline -20` — what actually happened, by session tag.
2. `pnpm test` — is the baseline green?
3. `curl -s <deployed>/api/health` — is the deploy alive?
4. `docs/PROGRESS.md` — which card is next and what did the last session warn about.

If tests and health are green and the card matches the log, proceed. If any of the three disagrees, fix that before writing a line of feature code.

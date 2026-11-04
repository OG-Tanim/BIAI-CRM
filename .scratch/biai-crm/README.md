# BIAI CRM — session runbook

Seven tickets, one per session. Tickets 05 and 06 may run in either order; everything else is a chain.

## Before a session

1. `git log --oneline -3` — confirm you are where the last session stopped.
2. `pnpm test` — the baseline must be green before you change anything.
3. Open `docs/PROGRESS.md` — the next ticket is the first whose blockers are all ticked.

## The ritual

1. Open the ticket.
2. Paste the preamble below, with the ticket path filled in.
3. Work until every box in the ticket is ticked. Not "mostly ticked".
4. Tick the boxes in the ticket file, then update `docs/PROGRESS.md` with a handoff line.
5. Commit as `S<n>: <title>`.

### Preamble

```
Implement .scratch/biai-crm/issues/<NN>-<slug>.md

Session constraints:
1. No issue tracker exists in this repo. That file is the ticket. Do not fetch one, do not ask
   where one is.
2. The `tdd` skill is not installed. Skip that step. Write tests only at the two pre-agreed seams
   named in docs/SPEC.md -> Testing Decisions: the pure domain module, and the HTTP routes. No new
   seams.
3. Do not run the code-review skill this session. It runs once after 04 and once after 07.
4. Read only the SPEC sections named under "Read" in the ticket. Never read docs/SPEC.md or
   docs/IMPLEMENTATION_PLAN.md end to end.
5. Before committing: tick the ticket's boxes, then update docs/PROGRESS.md.
```

### Why those five constraints exist

They are load-bearing, not decoration:

1. Without it, the agent stops to ask where the tracker is, or invents one.
2. `/implement` calls a skill that is not installed. Without the override, every session spends a
   turn failing that call.
3. `code-review` spawns two cold sub-agents per run. Mid-plan it reviews features that do not exist
   yet, and reports missing integration you are about to write. Twice is enough.
4. The spec is ~380 lines and the plan ~277. Re-reading both every session is the largest avoidable cost
   in this workflow.
5. `PROGRESS.md` is the only state a cold session inherits.

## Code review, exactly twice

After ticket 04 and again after 07:

```
/code-review since <sha>
```

`<sha>` is the commit *before* the work you want reviewed — the `S3` commit for the first run, the
`S4` commit for the second, so the second covers 05, 06 and 07 together.

## Stopping mid-ticket

If you stop before the ticket is done, leave it unticked. Write in `PROGRESS.md`: what is done, what
is not, and the exact command that fails. The next session starts there rather than re-deriving it.

## Ticket map

| Ticket | Spec sections to read |
|---|---|
| 01 Foundation | Architecture · Schema changes · Environments and seed data |
| 02 Extraction | Extraction contract · Reply placeholders · Reply language |
| 03 Capture & Save | API contracts · Status transitions · Schema changes |
| 04 Pipeline | User stories 21–27, 48 · Status transitions · The 48-hour rule |
| 05 Follow-up & Summary | User stories 28–33, 37–41 · The 48-hour rule |
| 06 Test data & eval | Environments and seed data · Further Notes → Anomalies · Testing Decisions |
| 07 Hardening & handover | Known risks · Out of Scope |

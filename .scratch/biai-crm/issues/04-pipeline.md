# 04: Pipeline

**What to build:** A board of five columns showing only genuine sales leads, where each card can be moved, annotated and counted, and non-leads stay out of the way.

**Blocked by:** 03 — Capture & Save

**Status:** ready-for-agent

**Read:** User stories 21–27 and 48 · Status transitions · The 48-hour rule

**Do not build:** the follow-up queue, the weekly summary, seed data.

- [ ] Five columns with per-column counts; cards show name, company, role, interest, kind and age
- [ ] Moving a card records the new status, stamps the contact time, and appends the note
- [ ] A note with no status change moves nothing and restamps nothing
- [ ] Spam, job seekers and support enquiries never appear as cards, and the exclusion happens in the query rather than the view
- [ ] A list view can be filtered by status and by kind

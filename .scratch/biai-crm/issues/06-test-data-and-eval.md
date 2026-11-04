# 06: Test data & eval

**What to build:** The testing branch looks like a working pipeline, and extraction quality becomes measurable row by row instead of a matter of opinion.

**Blocked by:** 04 — Pipeline

**Status:** ready-for-agent

**Read:** Environments and seed data · Further Notes → Anomalies in the sample data · Testing Decisions

**Do not build:** any import endpoint, any upload, any CSV parsing exposed to a user.

- [x] Seeding the testing branch populates the board, the follow-up queue and the weekly summary
- [x] Seeding refuses to run when pointed at the production connection string
- [x] All twenty sample messages load with their original timestamps
- [x] The eval runs all twenty through extraction, prints a row-by-row pass/fail, and exits non-zero on any mismatch

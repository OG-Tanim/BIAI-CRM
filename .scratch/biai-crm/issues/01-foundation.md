# 01: Foundation

**What to build:** The application runs against both database branches, with the full schema applied and the production branch sitting empty. There is no user-facing feature yet; the deliverable is that no later session has to fight the environment.

**Blocked by:** None (can start immediately)

**Status:** complete

**Read:** Architecture · Schema changes · Environments and seed data

**Do not build:** any screen, any extraction, any seed data.

- [x] The application responds healthy and reports which branch it is connected to
- [x] Both branches carry both tables and hold zero rows
- [x] The build is clean and the test command passes with one smoke assertion
- [x] Every environment variable is documented in an example file, and no secret is committed
- [x] `docs/PROGRESS.md` exists and tracks all seven tickets

## Session note (S0)

Verified against both Neon branches (testing and production). Each carries `enquiries` and
`notes` with zero rows, and `/api/health` reports the branch it is actually connected to. An
older, incompatible empty schema found on the branches was reset before the specified schema
was pushed. The public-deployment part of this ticket was removed at the project owner's
request, so the acceptance checks cover the running application and the database environments
only.

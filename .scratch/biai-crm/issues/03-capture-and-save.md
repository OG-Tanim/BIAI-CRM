# 03: Capture & Save

**What to build:** The operator reviews the proposal, corrects anything wrong, saves it, and the enquiry lands in New. A phone number already on file is warned about without blocking the save.

**Blocked by:** 02 — Extraction

**Status:** complete

**Read:** API contracts · Status transitions · Schema changes

**Do not build:** the board, the follow-up queue, the weekly summary.

- [x] Saving creates exactly one enquiry, in New status, with the original message preserved verbatim
- [x] Saving a phone number that already exists warns and names the earlier enquiry, and the save still proceeds
- [x] The reply keeps its placeholders as a template; the filled version is stored separately and is what gets copied
- [x] Copying a reply with a placeholder still present warns instead of copying

# 05: Follow-up & Summary

**What to build:** A queue of people who have gone quiet for 48 hours, and a weekly summary that narrates numbers the database actually computed.

**Blocked by:** 04 — Pipeline

**Status:** complete

**Read:** User stories 28–33 and 37–41 · The 48-hour rule

**Do not build:** any notification, email, or scheduled job.

- [x] The queue lists New and Contacted sales leads untouched for 48 hours, oldest first
- [x] The queue measures from last contact where one exists, and from creation otherwise
- [x] The queue excludes spam, job seekers, paid and lost
- [x] An enquiry contacted 47h59m ago is absent; at exactly 48h it is present
- [x] The weekly summary narrates counts computed by the database, never counts recalled by the model

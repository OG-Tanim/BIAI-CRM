# 05: Follow-up & Summary

**What to build:** A queue of people who have gone quiet for 48 hours, and a weekly summary that narrates numbers the database actually computed.

**Blocked by:** 04 — Pipeline

**Status:** ready-for-agent

**Read:** User stories 28–33 and 37–41 · The 48-hour rule

**Do not build:** any notification, email, or scheduled job.

- [ ] The queue lists New and Contacted sales leads untouched for 48 hours, oldest first
- [ ] The queue measures from last contact where one exists, and from creation otherwise
- [ ] The queue excludes spam, job seekers, paid and lost
- [ ] An enquiry contacted 47h59m ago is absent; at exactly 48h it is present
- [ ] The weekly summary narrates counts computed by the database, never counts recalled by the model

# 02: Extraction

**What to build:** Pasting a single message returns a complete, editable proposal — who sent it, how to reach them, what they want, what kind of message it is, a one-line summary, and a reply in their own language carrying placeholders wherever the answer is not known. Nothing is written anywhere.

**Blocked by:** 01 — Foundation

**Status:** complete

**Read:** Extraction contract · Reply placeholders · Reply language

**Do not build:** any screen, any persistence, any status change.

- [x] A Banglish message returns every field, and no status field appears in the response
- [x] A sender line carrying a role and a company yields the role and the company separately, with the person's name clean
- [x] A message containing no phone number returns no phone rather than a guess
- [x] A Bangla-script message receives a Bangla reply, and a reply failing that check comes back empty rather than in English
- [x] A reply never states a price, date, duration, discount, refund term, certificate status or payment method; those appear as placeholders
- [x] A placeholder outside the agreed set voids the whole reply rather than being passed through
- [x] Extracting writes nothing to the database

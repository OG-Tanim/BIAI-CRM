# BIAI CRM

A small internal CRM for BIAI, an AI training company in Bangladesh. It captures enquiries that
arrive by WhatsApp, Facebook, the website and phone calls, keeps each person on one record, and
shows the sales pipeline, the follow-ups and a weekly summary.

## What it does

| Screen | What it is for |
| --- | --- |
| **Capture** (`/`) | Paste a message, then type the details yourself or let **Read message** propose them: name, company, job title, phone, channel, interest, kind, summary and whether it needs attention. **Generate reply** drafts a reply from the message. Every field is editable before saving, the message is stored byte for byte, and the enquiry always lands in **New**. |
| **Pipeline** (`/pipeline`) | Five columns — New, Contacted, Interested, Paid, Lost — holding genuine sales leads only. Search by name or phone number, filter by status and attention, move a card between columns, append a note, and flag a card for attention. Each card shows the person, their company and role, their phone when they gave one, what they want, the summary and how long the card has been waiting. |
| **Enquiry** (`/enquiries/:id`) | One enquiry in full: the original message exactly as it arrived, the reply box, and every note in order. **Generate reply** redrafts from the original question; the reply can be edited, copied and saved to the enquiry. |
| **Follow-ups** (`/follow-ups`) | Sales leads in New or Contacted that nobody has reached for at least 48 hours, oldest first. Each name opens the enquiry. |
| **List** (`/enquiries`) | Every enquiry of every kind — sales leads, job seekers, support issues, spam and unclear messages — filterable by status and kind, with a link to each record and a delete action. Non-sales messages live here rather than on the board. |
| **Summary** (`/summary`) | Seven-day counts from the database plus a written narration. The model writes only prose around token placeholders; the server fills every number. |

## How an enquiry moves

A captured message starts in **New**. Moving it to **Contacted**, **Interested**, **Paid** or
**Lost** is the operator's decision and is made on the board, never while capturing. Leaving New
records the first contact time; later moves keep it, so the 48-hour follow-up clock measures how
long the customer has been waiting rather than what was last clicked.

A note can be written whenever a card moves, or on its own, and is kept against the enquiry in
order. Replies carry `{{placeholder}}` tokens wherever a price, date or policy is unknown, so no
invented fact reaches a customer; copying a reply that still has one asks for confirmation first.

The AI is an assistant throughout. It proposes fields and drafts replies, it never sets a status,
and every screen stays usable by hand when the AI is unavailable.

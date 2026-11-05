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

## Run it

Node 20+, pnpm, and a Postgres database. The project's own environments use two Neon branches,
**testing** and **production**.

```bash
pnpm install
cp .env.example .env.local     # fill in the connection strings, then choose a mode
pnpm db:push:test              # create the schema on the testing branch
pnpm db:seed --target test     # optional: the twenty sample enquiries
pnpm dev                       # http://localhost:3000
```

`DATABASE_BRANCH` selects the branch the app talks to: `testing` uses `TEST_DATABASE_URL`,
`production` uses `DATABASE_URL`. With neither set, a process holding only `DATABASE_URL` is
production, and one holding both is production too — the label comes from the URL that was actually
opened, never from a separate setting that can disagree with it.

`MOCK_AI=1` returns canned fixtures keyed to the sample messages, so the AI screens work with no key
and no spend. Without a key and without mock mode the app still runs: the screens carry an
"AI unavailable" banner, **Read message** and **Generate reply** are disabled, and every field stays
editable and savable by hand.

Use a different port without the `pnpm --` forwarding trap:

```bash
./node_modules/.bin/next dev -p 3100
```

`pnpm db:verify` reports table presence and row counts for both branches. Production holds the
schema and zero rows; the seed refuses to run against it, and refuses when `TEST_DATABASE_URL`
resolves to the same database as `DATABASE_URL`.

## Testing

```bash
pnpm typecheck    # tsc --noEmit
pnpm test         # Vitest
pnpm build        # production build
pnpm eval         # the twenty samples through the configured extractor
```

Tests live at two seams. The pure domain module (`lib/domain/*`) holds the decisions that are easy
to get subtly wrong — extraction and reply validation, the placeholder allowlist, status transitions,
the 48-hour rule — with no database and no network. The HTTP routes (`lib/api/*`) cover the wiring a
pure suite cannot see: what a save writes, what the board and queue exclude, which error codes come
back. Those run against `TEST_DATABASE_URL` and roll back inside a transaction.

Nothing is tested through the UI, and the AI is always replaced by a fake or a fixture. With
`MOCK_AI=1`, `pnpm eval` checks the harness and fixtures rather than model quality; with a real key
and model it becomes the measurement.

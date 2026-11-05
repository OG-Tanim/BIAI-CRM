import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * The single source of truth for the database shape.
 *
 * Enums are text columns with CHECK constraints rather than Postgres enum
 * types, so adding a value is a one-line change instead of an ALTER TYPE.
 */
export const enquiries = pgTable(
  'enquiries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    company: text('company'),
    jobTitle: text('job_title'),
    phone: text('phone'),
    channel: text('channel').notNull(),
    channelHandle: text('channel_handle'),
    interest: text('interest').notNull(),
    kind: text('kind').notNull(),
    status: text('status').notNull().default('new'),
    needsAttention: boolean('needs_attention').notNull().default(false),
    summary: text('summary').notNull().default(''),
    rawMessage: text('raw_message').notNull(),
    suggestedReply: text('suggested_reply').notNull().default(''),
    replyFilled: text('reply_filled'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastContactedAt: timestamp('last_contacted_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('enquiries_phone_idx').on(table.phone),
    index('enquiries_status_kind_idx').on(table.status, table.kind),
    check(
      'enquiries_channel_check',
      sql`${table.channel} in ('whatsapp','facebook','website','email','phone')`,
    ),
    check(
      'enquiries_interest_check',
      sql`${table.interest} in ('bootcamp','fellowship','corporate','unclear')`,
    ),
    check(
      'enquiries_kind_check',
      sql`${table.kind} in ('sales_lead','job_seeker','support','spam','unclear')`,
    ),
    check(
      'enquiries_status_check',
      sql`${table.status} in ('new','contacted','interested','paid','lost')`,
    ),
  ],
);

export const notes = pgTable('notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  enquiryId: uuid('enquiry_id')
    .notNull()
    .references(() => enquiries.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Enquiry = typeof enquiries.$inferSelect;
export type NewEnquiry = typeof enquiries.$inferInsert;
export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;

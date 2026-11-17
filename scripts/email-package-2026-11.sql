-- ===========================================================================
-- Email package (PRs #130, #131 and the reminders PR), as one paste.
--
-- Exactly the statements those PRs appended to supabase/schema.sql, copied
-- here so they can be run on their own in the Supabase SQL editor instead of
-- the whole 21,000-line file. Re-runnable: running it twice changes nothing
-- the second time. It only ADDS tables and a constraint; it changes no
-- existing row.
--
-- Run on STAGING after merging, then on PRODUCTION at release.
-- Afterwards, on staging only: Settings -> Emails -> Test mode = your inbox.
--
-- What it creates:
--   email_controls      the Settings -> Emails switches (one row; starts "on")
--   email_log           the last emails tried, with a masked recipient
--   appointment_emails  which booking email / reminder each session got (once each)
-- The data reset's existing TRUNCATE ... CASCADE already clears the new log
-- tables; the full schema.sql also lists them by name.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Email controls and the send log (Settings -> Emails; src/lib/emailControls.ts
-- has the rules, src/lib/emailServer.ts applies them).
--
-- email_controls is ONE row (id = 1): the master switch, the test-mode
-- inbox and the kinds switched off one by one. It is read on its own, never
-- through SITE_SETTINGS_SELECT, so a database without it only affects email
-- and falls back to "on, no test inbox" -- how email behaved before. Staging
-- is expected to be switched to test mode by a person after this is applied;
-- the default stays "on" so production's complaint and deletion receipts
-- keep going out.
--
-- email_log is one row per email the app tried to send: the kind, a MASKED
-- recipient (as***@gmail.com), the subject, sent / skipped / failed and why.
-- Not evidence (the case itself is the record), so no append-only guard; the
-- data reset truncates it (newest debug_reset_all_data()). No foreign keys,
-- so scripts/clean-e2e-residue.mjs has nothing to learn.
-- Both are read by admins only; every write is the service role's.
-- ---------------------------------------------------------------------------
create table if not exists email_controls (
  id smallint primary key default 1 check (id = 1),
  sending_enabled boolean not null default true,
  test_inbox text check (test_inbox is null or (length(test_inbox) <= 254 and test_inbox ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  disabled_kinds text[] not null default '{}',
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into email_controls (id) values (1) on conflict (id) do nothing;

alter table email_controls enable row level security;

drop policy if exists "email_controls_select_admin" on email_controls;
create policy "email_controls_select_admin" on email_controls
  for select using (is_admin());

revoke insert, update, delete on email_controls from anon, authenticated;

create table if not exists email_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind ~ '^[a-z0-9_]{1,40}$'),
  recipient text not null check (length(recipient) <= 254),
  subject text not null check (length(subject) <= 300),
  status text not null check (status in ('sent', 'skipped', 'failed')),
  reason text check (reason is null or reason ~ '^[a-z0-9_]{1,40}$'),
  redirected boolean not null default false
);

create index if not exists email_log_created_at_idx on email_log (created_at desc);

alter table email_log enable row level security;

drop policy if exists "email_log_select_admin" on email_log;
create policy "email_log_select_admin" on email_log
  for select using (is_admin());

revoke insert, update, delete on email_log from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Booking emails, once each (src/lib/appointmentEmailServer.ts).
--
-- One row per (appointment, event) the patient was emailed about: received,
-- confirmed, cancelled. The INSERT is the claim -- the payment callback and
-- Razorpay's webhook can both confirm one booking, and only the request
-- whose insert lands sends. What happened to the email itself is in
-- email_log. The appointment cascades, so scripts/clean-e2e-residue.mjs has
-- nothing to learn; the data reset truncates it with the appointments
-- (newest debug_reset_all_data()). Admin read only; written by the service
-- role.
-- ---------------------------------------------------------------------------
create table if not exists appointment_emails (
  appointment_id uuid not null references appointments(id) on delete cascade,
  event text not null check (event in ('received', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  primary key (appointment_id, event)
);

alter table appointment_emails enable row level security;

drop policy if exists "appointment_emails_select_admin" on appointment_emails;
create policy "appointment_emails_select_admin" on appointment_emails
  for select using (is_admin());

revoke insert, update, delete on appointment_emails from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Session reminders (src/lib/bookingReminders.ts): appointment_emails also
-- records the day-before and hour-before reminder, once each. Widens the
-- event check by name; re-runnable (drop if exists, then add).
-- ---------------------------------------------------------------------------
alter table appointment_emails drop constraint if exists appointment_emails_event_check;
alter table appointment_emails add constraint appointment_emails_event_check
  check (event in ('received', 'confirmed', 'cancelled', 'reminder_24h', 'reminder_1h'));

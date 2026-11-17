-- One-off: bring PRODUCTION's database up to date for the legal & privacy
-- release (PR #121 / #122). Paste into the production project's Supabase
-- SQL editor and press Run. Re-runnable: running it twice is safe (and is
-- how staging was checked). Taken verbatim from supabase/schema.sql.
--
-- Adds: cookie_consents, policy_acceptances (+ signup trigger on
-- auth.users), data_requests, grievances; refreshes debug_reset_all_data's
-- table list; re-grants service_role EXECUTE.

-- ===== 1. Latest debug_reset_all_data (table list now includes the new tables)
create or replace function public.debug_reset_all_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_accounts integer;
  admin_count integer;
begin
  select count(*) into admin_count from profiles where role = 'admin';
  if admin_count = 0 then
    raise exception 'refusing to reset: no admin account would be left behind';
  end if;

  truncate table
    -- Added in place rather than by re-declaring this function an eleventh
    -- time: `create or replace` is idempotent, so editing the newest
    -- declaration re-applies identically, and another copy of a 60-table
    -- list is the bloat this file already carries too much of.
    refund_attempts,
    session_settlements,
    pay_later_payments,
    session_credit_ledger,
    session_entitlements,
    payment_webhook_events,
    payments,
    business_expenses,
    capital_investments,
    marketing_campaigns,
    balance_sheet_entries,
    admin_activity_log,
    -- Its gaps go with it: a reset empties the history they are missing from.
    admin_activity_gaps,
    -- Patients', therapists' and hospitals' side of the same history.
    user_activity_log,
    -- Measurements of bookings the reset removes.
    checkout_timings,
    admin_impersonation_sessions,
    session_suggestions,
    appointment_reassignment_log,
    payment_failure_log,
    package_purchase_events,
    home_visit_purchase_events,
    appointments,
    patient_package_purchases,
    home_visit_package_purchases,
    therapist_payout_requests,
    therapist_payout_batches,
    session_note_revisions,
    session_notes,
    -- The patient-facing summary beside each note, and its append-only
    -- revisions, named like the note's rather than left to CASCADE.
    session_summary_revisions,
    session_summaries,
    patient_medical_documents,
    pain_assessments,
    -- The neurological exam chart, append-only by trigger like the Pain Map,
    -- so CASCADE through the account delete below would raise on it.
    neuro_assessments,
    -- The paediatric exam (phase 5a, end of this file), append-only by
    -- trigger for the same reason.
    peds_assessments,
    -- The shared measurement layer (append-only by trigger, the same reason)
    -- and the goals and milestones planned against it, named rather than
    -- left to CASCADE (all three are at the end of this file). The record
    -- of a milestone reopened by the clinic first: it references them.
    care_milestone_events,
    care_milestones,
    care_goals,
    outcome_measurements,
    -- The phase and status-override history (phase 3a, end of this file),
    -- append-only by trigger for the same reason.
    care_status_events,
    -- The patient diary (phase 4a, end of this file), append-only by
    -- trigger like the measurements beside it.
    patient_diary_entries,
    -- What the clinic chose to show on one patient's Health Profile (end of
    -- this file); the condition-kind settings are settings and stay.
    patient_profile_widget_overrides,
    -- Who closed or has seen which announcement, and everybody's private
    -- notebook (both at the end of this file). The announcements themselves
    -- are the admin's own writing, like the FAQs, and stay.
    announcement_receipts,
    notebook_pages,
    -- The mirror of Razorpay's refunds (end of this file).
    razorpay_refunds,
    -- Test-account logins from the debug bar, and the record of deleted
    -- accounts (both at the end of this file). The second is append-only by
    -- trigger, so it is truncated here rather than left to CASCADE.
    debug_test_accounts,
    account_deletions,
    -- The guided video assessment (phase 7a, end of this file): the events
    -- are append-only by trigger and the runs refuse a delete, so they are
    -- named here rather than left to CASCADE; the live display goes with them.
    assessment_live_display,
    -- The companion heartbeat (E12, end of this file) goes with its runs.
    assessment_companion_seen,
    assessment_run_events,
    -- Home exercises (phase 7d, end of this file): the items and the
    -- teaching events are append-only by trigger and a plan refuses a
    -- delete, so they are named rather than left to CASCADE.
    exercise_teaching_events,
    exercise_plan_items,
    exercise_plans,
    assessment_runs,
    condition_change_requests,
    condition_access_grants,
    patient_condition_profiles,
    patient_addresses,
    patient_admin_notes,
    therapist_admin_notes,
    hospital_admin_notes,
    profile_change_requests,
    therapist_availability_override,
    therapist_availability_template,
    therapist_schedule_state,
    patient_referrals,
    b2b_leads,
    -- The record of who was turned away goes with the accounts and leads
    -- the reset removes (declined_applications, at the end of this file).
    declined_applications,
    home_visit_waitlist,
    home_visit_areas,
    home_visit_packages,
    intake_question_templates,
    pain_map_question_templates,
    care_plan_versions,
    care_plans,
    communication_flags,
    contact_reveal_log,
    risk_reviews,
    risk_signals,
    care_plan_reviews,
    -- marketing_campaigns references promo_codes, so it is truncated above
    -- rather than left to CASCADE reach it: a campaign pointing at a code
    -- that no longer exists could not say what it was attributed by.
    patient_invites,
    promo_codes,
    -- Cookie pop-up choices made while the app was being tested are not a
    -- clinic's consent evidence; launch starts the count from zero.
    cookie_consents,
    -- Requests and complaints made while the app was being tested.
    data_requests,
    grievances
  cascade;
  -- NOT truncated, and all three for one reason: `faqs`, `testimonials` and
  -- `mission_principles` are the website's own content, written by a person on
  -- Settings -> Public Site. `mission_principles` used to be cleared here on
  -- the argument that the pages then fall back to the shipped wording in
  -- `src/lib/mission.ts` -- which is true, and is exactly the argument an owner
  -- rejects the first time a reset replaces their promises with ours. Nothing
  -- in these three is produced by testing and every row has to be retyped by
  -- hand, so they follow `treatment_categories`: kept, one table at a time,
  -- each with its own reason.
  --
  -- Also NOT truncated: `dev_reachouts`, and the two `dev_contact_*` settings
  -- beside it. These are the developer's own leads, from the "Say hello" form
  -- behind the footer credit. Testing produces none of them -- the e2e spec
  -- cleans up after itself -- so a reset has nothing here to clear and a real
  -- message to lose. Nothing reaches the table through CASCADE either: its one
  -- foreign key, `contacted_by`, points at `profiles`, which is never
  -- truncated. Do not add it to the list above.
  -- (src/lib/devReachoutResetGuard.test.ts holds this.)

  with removed as (
    delete from auth.users
    where id not in (select id from profiles where role = 'admin')
    returning 1
  )
  select count(*) into deleted_accounts from removed;

  -- **`site_settings` and `risk_rules` are deliberately not touched.**
  --
  -- This used to put every one of ~60 settings columns back to its default, on
  -- the reading that a reset restores a clean baseline. That reading is wrong
  -- in the one direction that costs an owner something: **this is a data
  -- reset, and none of that is data.** Every column in `site_settings` is
  -- configuration a person chose -- the clinic's name, its tagline and
  -- description, the email and phone patients contact it on, the footer, the
  -- mission and vision, the splash wording, and every window, lead time and
  -- switch an admin set deliberately. Testing generates none of it, and a
  -- reset that cleared it handed back a site calling itself something else
  -- with somebody else's contact details on it.
  --
  -- The asymmetry decides it. Keeping them costs a tester who wanted a clean
  -- config baseline a few fields, each with its own control on its own screen.
  -- Clearing them costs an owner their clinic's identity -- and the mission
  -- and vision have no "what was it before" anywhere. `risk_rules` goes the
  -- same way for the same reason: the thresholds are an admin's tuning on
  -- Today -> Risk, while the signals they produced are rows and are truncated
  -- above.
  --
  -- Anything added here later still needs a real WHERE clause -- see the
  -- pg-safeupdate note in AGENTS.md, which is why the two statements that used
  -- to live here carried `where rule_key is not null` and `where id`.

  return jsonb_build_object(
    'ok', true,
    'deleted_accounts', deleted_accounts
  );
end;
$$;

revoke all on function public.debug_reset_all_data() from public;
revoke all on function public.debug_reset_all_data() from anon;
revoke all on function public.debug_reset_all_data() from authenticated;

-- ===== 2. New tables, policies and triggers
-- =============================================================================
-- Brand: the contact email moves to the MoveRestore domain.
-- =============================================================================
-- Same pattern as the site-name block above: the default moves, and the
-- singleton row moves only while it still holds the address this file
-- shipped (hello@drpoojaphysio.com, from before the brand was chosen). An
-- address an admin typed themselves is left alone. Re-runnable: the second
-- run matches no row.
alter table site_settings alter column contact_email set default 'hello@moverestorephysio.com';

update site_settings set contact_email = 'hello@moverestorephysio.com'
  where contact_email = 'hello@drpoojaphysio.com';

-- =============================================================================
-- Cookie consent records: every choice made in the cookie pop-up.
-- =============================================================================
-- One row per choice (Accept all, Reject all, Save my choices, or closing the
-- pop-up), written by /api/consent with the service role. It is the clinic's
-- evidence of what each visitor agreed to and under which policy version, and
-- what Settings -> Cookie consent counts. No name, email, phone or IP address
-- is kept: visitor_id is a random id made in the browser, and user_id is set
-- only when the visitor was signed in (worked out on the server, never sent
-- by the client).
--
-- Append-only by trigger, like the other evidence tables: a choice that was
-- made is never edited or deleted. The one change allowed is user_id going to
-- null, which is what `on delete set null` does when an account is removed.
create table if not exists cookie_consents (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null,
  user_id uuid references profiles(id) on delete set null,
  analytics boolean not null,
  marketing boolean not null,
  action text not null check (action in ('accept_all', 'reject_all', 'save', 'dismiss')),
  policy_version text not null check (char_length(policy_version) between 1 and 32),
  page_path text check (page_path is null or char_length(page_path) <= 200),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  created_at timestamptz not null default now(),
  constraint cookie_consents_accept_all_allows_analytics check (action <> 'accept_all' or analytics),
  constraint cookie_consents_reject_allows_nothing check (action not in ('reject_all', 'dismiss') or (not analytics and not marketing))
);

create index if not exists cookie_consents_created_at_idx on cookie_consents (created_at desc);
create index if not exists cookie_consents_visitor_idx on cookie_consents (visitor_id, created_at desc);
create index if not exists cookie_consents_user_idx on cookie_consents (user_id) where user_id is not null;

alter table cookie_consents enable row level security;

drop policy if exists "cookie_consents_select_admin" on cookie_consents;
create policy "cookie_consents_select_admin" on cookie_consents
  for select using (is_admin());

revoke insert, update, delete on cookie_consents from anon, authenticated;

create or replace function public.cookie_consents_is_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- An account being removed clears its link and nothing else.
  if tg_op = 'UPDATE'
     and old.user_id is not null and new.user_id is null
     and new.id = old.id and new.visitor_id = old.visitor_id
     and new.analytics = old.analytics and new.marketing = old.marketing
     and new.action = old.action and new.policy_version = old.policy_version
     and new.page_path is not distinct from old.page_path
     and new.country is not distinct from old.country
     and new.created_at = old.created_at then
    return new;
  end if;
  raise exception 'cookie_consents is append-only: a recorded consent choice is never edited or deleted';
end;
$$;

revoke all on function public.cookie_consents_is_append_only() from public;
revoke all on function public.cookie_consents_is_append_only() from anon;
revoke all on function public.cookie_consents_is_append_only() from authenticated;

drop trigger if exists trg_cookie_consents_append_only on cookie_consents;
create trigger trg_cookie_consents_append_only
  before update or delete on cookie_consents
  for each row execute function public.cookie_consents_is_append_only();

-- =============================================================================
-- Policy acceptances: what each person agreed to, and when.
-- =============================================================================
-- One row per agreement (src/lib/policyAcceptance.ts):
--   terms_privacy      the Terms of use and Privacy policy, at signup (from the
--                      signup form's tick box) or on a later sign-in when the
--                      version changed, or the account was made by staff
--   telehealth_consent the consent ticked on a video booking
--   guardian_consent   a parent or guardian confirming a booking for a child
-- `version` is the legal pages' effective date. `accepted_at` is the
-- database's clock, never the browser's. Append-only by trigger: an agreement
-- that was given is never edited. Two changes are allowed: appointment_id
-- going null when a booking is removed, and the row going with its profile.
create table if not exists policy_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  document text not null check (document in ('terms_privacy', 'telehealth_consent', 'guardian_consent')),
  version text not null check (version ~ '^[0-9A-Za-z.-]{1,32}$'),
  context text not null check (context in ('signup', 'reaccept', 'booking')),
  appointment_id uuid references appointments(id) on delete set null,
  accepted_at timestamptz not null default now()
);

create index if not exists policy_acceptances_user_idx on policy_acceptances (user_id, document, accepted_at desc);
create index if not exists policy_acceptances_appointment_idx on policy_acceptances (appointment_id) where appointment_id is not null;

alter table policy_acceptances enable row level security;

-- A person reads their own agreements (the dashboards' terms gate does);
-- staff read everyone's. Writes go through the service role only.
drop policy if exists "policy_acceptances_select_own" on policy_acceptances;
create policy "policy_acceptances_select_own" on policy_acceptances
  for select using (user_id = (select auth.uid()));

drop policy if exists "policy_acceptances_select_admin" on policy_acceptances;
create policy "policy_acceptances_select_admin" on policy_acceptances
  for select using (is_admin());

revoke insert, update, delete on policy_acceptances from anon, authenticated;

create or replace function public.policy_acceptances_is_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from profiles where id = old.user_id) then
    return old;
  end if;
  if tg_op = 'UPDATE'
     and old.appointment_id is not null and new.appointment_id is null
     and new.id = old.id and new.user_id = old.user_id
     and new.document = old.document and new.version = old.version
     and new.context = old.context and new.accepted_at = old.accepted_at then
    return new;
  end if;
  raise exception 'policy_acceptances is append-only: an agreement that was given is never edited or deleted';
end;
$$;

revoke all on function public.policy_acceptances_is_append_only() from public;
revoke all on function public.policy_acceptances_is_append_only() from anon;
revoke all on function public.policy_acceptances_is_append_only() from authenticated;

drop trigger if exists trg_policy_acceptances_append_only on policy_acceptances;
create trigger trg_policy_acceptances_append_only
  before update or delete on policy_acceptances
  for each row execute function public.policy_acceptances_is_append_only();

-- The signup forms put the version they showed in the user's metadata
-- (`accepted_terms_version`); this records it at the moment the account is
-- made, with the database's clock. Named to sort after on_auth_user_created,
-- so the profile it points at already exists. A missing or malformed version
-- records nothing: that person is asked on their first sign-in instead.
create or replace function public.record_signup_terms_acceptance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v text := new.raw_user_meta_data ->> 'accepted_terms_version';
begin
  if v is not null and v ~ '^[0-9A-Za-z.-]{1,32}$'
     and exists (select 1 from public.profiles where id = new.id) then
    insert into public.policy_acceptances (user_id, document, version, context)
    values (new.id, 'terms_privacy', v, 'signup');
  end if;
  return new;
end;
$$;

revoke all on function public.record_signup_terms_acceptance() from public;
revoke all on function public.record_signup_terms_acceptance() from anon;
revoke all on function public.record_signup_terms_acceptance() from authenticated;

drop trigger if exists on_auth_user_terms_accepted on auth.users;
create trigger on_auth_user_terms_accepted
  after insert on auth.users
  for each row execute function public.record_signup_terms_acceptance();

-- =============================================================================
-- Data requests and grievances (Phase 3 of the legal work).
-- =============================================================================
-- data_requests: a person's request about their own data. Today one kind,
-- `deletion` -- "Delete my account" on a profile page. It is a request a
-- person on the People desk works, not an instant delete: clinical, payment
-- and audit records must be kept, so deleting an account means removing the
-- login and contact details through the existing admin delete, and a request
-- may be refused with a reason. The deadline is 30 days (DPDP Act s.12;
-- src/lib/dataRequests.ts). `kind = 'export'` rows are written, already
-- completed, each time someone downloads their data, so the clinic can
-- answer "when did they last receive a copy".
--
-- grievances: the form on /grievances. Anyone may file one, signed in or
-- not; a signed-in filer is linked by the server, never by the form. The
-- Grievance Officer must acknowledge within 48 hours and resolve within 30
-- days (Consumer Protection (E-Commerce) Rules 2020, r.4(5)).
--
-- Both are written only by the service role (the routes); a person reads
-- their own rows, the back office reads all. Neither is append-only: a
-- request moves through its statuses, and each move is in the admin log.
create table if not exists data_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (reference ~ '^(DEL|EXP)-[A-Z0-9]{6}$'),
  user_id uuid references profiles(id) on delete set null,
  role text not null check (role in ('patient', 'therapist', 'hospital')),
  kind text not null check (kind in ('deletion', 'export')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'completed', 'rejected', 'withdrawn')),
  reason text check (reason is null or char_length(reason) <= 1000),
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references profiles(id) on delete set null,
  constraint data_requests_rejection_says_why check (status <> 'rejected' or char_length(coalesce(trim(resolution_note), '')) >= 3)
);

create index if not exists data_requests_open_idx on data_requests (created_at) where status in ('open', 'in_progress');
create index if not exists data_requests_user_idx on data_requests (user_id, created_at desc) where user_id is not null;
create index if not exists data_requests_resolved_by_idx on data_requests (resolved_by) where resolved_by is not null;
-- At most one live deletion request per person: a second tap must not
-- open a second case.
create unique index if not exists data_requests_one_open_deletion
  on data_requests (user_id) where kind = 'deletion' and status in ('open', 'in_progress');

alter table data_requests enable row level security;

drop policy if exists "data_requests_select_own" on data_requests;
create policy "data_requests_select_own" on data_requests
  for select using (user_id = (select auth.uid()));

drop policy if exists "data_requests_select_admin" on data_requests;
create policy "data_requests_select_admin" on data_requests
  for select using (is_admin());

revoke insert, update, delete on data_requests from anon, authenticated;

create table if not exists grievances (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (reference ~ '^GRV-[A-Z0-9]{6}$'),
  user_id uuid references profiles(id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 254),
  phone text check (phone is null or char_length(phone) <= 30),
  category text not null check (category in ('service', 'payment', 'privacy', 'therapist', 'other')),
  booking_reference text check (booking_reference is null or char_length(booking_reference) <= 60),
  message text not null check (char_length(message) between 10 and 4000),
  status text not null default 'new' check (status in ('new', 'acknowledged', 'resolved')),
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 2000),
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  handled_by uuid references profiles(id) on delete set null,
  constraint grievances_resolution_says_how check (status <> 'resolved' or char_length(coalesce(trim(resolution_note), '')) >= 3)
);

create index if not exists grievances_open_idx on grievances (created_at) where status <> 'resolved';
create index if not exists grievances_user_idx on grievances (user_id) where user_id is not null;
create index if not exists grievances_handled_by_idx on grievances (handled_by) where handled_by is not null;

alter table grievances enable row level security;

drop policy if exists "grievances_select_own" on grievances;
create policy "grievances_select_own" on grievances
  for select using (user_id = (select auth.uid()));

drop policy if exists "grievances_select_admin" on grievances;
create policy "grievances_select_admin" on grievances
  for select using (is_admin());

revoke insert, update, delete on grievances from anon, authenticated;

-- A deletion request keeps who to write to until it is closed: the account's
-- email is cleared when the account is deleted, and the person is still owed
-- the "your account has been deleted" email. The update route clears both
-- columns the moment the request is closed, so they never outlive the case.
alter table data_requests add column if not exists contact_name text
  check (contact_name is null or char_length(contact_name) <= 120);
alter table data_requests add column if not exists contact_email text
  check (contact_email is null or char_length(contact_email) <= 254);


-- ===== 3. service_role EXECUTE (the file's final block)
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant execute on functions to service_role;

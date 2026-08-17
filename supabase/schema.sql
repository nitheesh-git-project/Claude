-- Run this in the Supabase SQL Editor (Project -> SQL Editor -> New query)
-- after creating your project. Safe to re-run (uses IF NOT EXISTS guards).

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('patient', 'therapist', 'admin')),
  full_name text not null,
  email text not null,
  phone text,
  timezone text,
  credentials text,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references profiles(id) on delete cascade,
  therapist_id uuid references profiles(id) on delete set null,
  slot_time timestamptz,
  timezone text,
  concern text,
  notes text,
  status text not null default 'requested' check (status in ('requested', 'confirmed', 'completed', 'cancelled')),
  razorpay_order_id text,
  razorpay_payment_id text,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'failed')),
  created_at timestamptz not null default now()
);

alter table appointments add column if not exists razorpay_order_id text;
alter table appointments add column if not exists razorpay_payment_id text;
alter table appointments add column if not exists payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'failed'));

-- Allow 'admin' and 'hospital' as roles for accounts that already existed
-- before these were added. Neither has a self-signup path — admin is
-- promoted by hand in the Table Editor; hospital accounts are provisioned
-- by the admin (see the B2B section below).
--
-- Hospital accounts carry an org name + a referral code patients can
-- optionally quote at signup. referred_by_hospital_id is set on the
-- *patient's* profile, either automatically (invite-link referrals) or by
-- looking up a typed referral code (self-serve referrals) — one field
-- answers attribution for both channels.
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('patient', 'therapist', 'admin', 'hospital'));
alter table profiles add column if not exists organization_name text;
alter table profiles add column if not exists referral_code text;
alter table profiles add column if not exists referred_by_hospital_id uuid references profiles(id);
-- The hospital's cut of each referred session's fee (e.g. 30 = hospital
-- gets 30%, company keeps 70%). Set once at onboarding by the admin —
-- only meaningful on rows where role = 'hospital'.
--
-- Also reused for role = 'therapist': the therapist's cut of each session
-- fee they're assigned to, set by admin on the Manage Therapists page.
-- Same column, same 0-100 meaning, just a different counterparty — no
-- reason to duplicate the field for a second role.
alter table profiles add column if not exists revenue_share_percent numeric(5,2);
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_revenue_share_range'
  ) then
    alter table profiles add constraint profiles_revenue_share_range
      check (revenue_share_percent is null or (revenue_share_percent >= 0 and revenue_share_percent <= 100));
  end if;
end $$;
create unique index if not exists profiles_referral_code_unique_idx
  on profiles (referral_code) where referral_code is not null;

-- Inbound B2B inquiries from the Hospitals page form. Submitted by
-- anonymous visitors (no login), so INSERT is open to the public but
-- nothing can read them back except the admin (via the service role).
create table if not exists b2b_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  source text not null check (source in ('Ads', 'Friends', 'Hospitals', 'Other')),
  org_details text,
  status text not null default 'new' check (status in ('new', 'contacted', 'onboarded', 'declined')),
  created_at timestamptz not null default now()
);

alter table b2b_leads enable row level security;
drop policy if exists "b2b_leads_insert_public" on b2b_leads;
create policy "b2b_leads_insert_public" on b2b_leads
  for insert with check (true);
grant insert on b2b_leads to anon, authenticated;

-- A hospital's referral of a specific patient, submitted from their own
-- dashboard. No client-side UPDATE — assigning a therapist/slot and
-- generating the invite link are admin-only actions via the service role.
create table if not exists patient_referrals (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references profiles(id) on delete cascade,
  patient_name text not null,
  address text,
  preferred_language text,
  medical_issue text,
  treatment_needed text,
  status text not null default 'pending_review' check (status in ('pending_review', 'therapist_assigned', 'invite_sent', 'converted', 'declined')),
  assigned_therapist_id uuid references profiles(id),
  assigned_slot_time timestamptz,
  invite_token uuid unique,
  converted_patient_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

alter table patient_referrals enable row level security;

drop policy if exists "patient_referrals_select_own" on patient_referrals;
create policy "patient_referrals_select_own" on patient_referrals
  for select using (auth.uid() = hospital_id);

drop policy if exists "patient_referrals_insert_own" on patient_referrals;
create policy "patient_referrals_insert_own" on patient_referrals
  for insert with check (auth.uid() = hospital_id);

revoke update on patient_referrals from authenticated;

-- A short admin-set note surfaced to the hospital in place of a blank
-- status when a pending_review referral genuinely can't be staffed right
-- now ("no capacity right now — will follow up") -- closes the "why is
-- nothing happening" support loop without building real
-- specialization/capacity matching.
alter table patient_referrals add column if not exists capacity_note text;

-- Links a patient's first appointment back to the referral that led to
-- it (white-glove channel only — self-serve code bookings have no
-- referral row, just the profile-level referred_by_hospital_id).
alter table appointments add column if not exists referral_id uuid references patient_referrals(id);

alter table profiles enable row level security;
alter table appointments enable row level security;

-- Profiles: a user can read and create their own profile row.
drop policy if exists "profiles_select_own" on profiles;
create policy "profiles_select_own" on profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on profiles;
create policy "profiles_insert_own" on profiles
  for insert with check (auth.uid() = id);

-- Auto-create the profile row when a new auth user signs up. This runs as
-- a database trigger (not client-side) so it works even before the user
-- has an active session — e.g. if "Confirm email" is on in Supabase Auth
-- settings, signUp() does not return a session until the email is
-- confirmed, and a client-side insert would fail the RLS check above.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_referred_by uuid;
  v_role text;
begin
  -- raw_user_meta_data is whatever the caller passed as options.data to
  -- auth.signUp() — for a public signup that's fully client-controlled, so
  -- it must NEVER be trusted to grant 'admin' or 'hospital'. 'therapist' is
  -- the only self-serve role beyond the 'patient' default; both of those
  -- start unapproved and gated behind admin approval below. Admin accounts are
  -- promoted by hand in the Table Editor; hospital accounts are created by
  -- the onboard-hospital route, which sets role via a service-role update
  -- *after* this trigger runs, bypassing this restriction entirely (as
  -- intended — that path never goes through public signUp metadata).
  v_role := case
    when new.raw_user_meta_data->>'role' = 'therapist' then 'therapist'
    else 'patient'
  end;

  -- Self-serve referral: if the signup form passed a hospital's referral
  -- code, resolve it to that hospital's profile id. An unknown/blank code
  -- just leaves this null rather than failing the signup.
  if new.raw_user_meta_data->>'referral_code' is not null then
    select id into v_referred_by from public.profiles
      where referral_code = new.raw_user_meta_data->>'referral_code'
      and role = 'hospital';
  end if;

  insert into public.profiles (id, role, full_name, email, phone, credentials, approved, referred_by_hospital_id)
  values (
    new.id,
    v_role,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'credentials',
    -- Both self-serve roles start unapproved: a patient signing up from the
    -- Patient Portal now waits on the same admin approval gate a therapist
    -- application does (see the "Pending Approvals" section of the admin
    -- dashboard). The only patients that skip this are hospital-referred
    -- ones, created by /api/patient/register-via-referral with the service
    -- role -- the admin already vetted those by assigning the referral and
    -- sending the invite, so that route sets approved = true itself.
    false,
    v_referred_by
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Lets admin lock a patient out of their dashboard (abuse, fraud, at their
-- own request) without deleting the account or its booking history.
-- Enforced in the proxy alongside the existing role/approved checks, so an
-- already-open session is kicked out on its next request, same as a
-- therapist whose approval gets revoked.
alter table profiles add column if not exists active boolean not null default true;

-- Independent of `active`: a therapist can be fully active (can log in, get
-- assigned bookings) but still be hidden from the public /team page — on
-- leave, fully booked, or not ready to be publicly featured yet. Admin-only,
-- defaults to visible so nothing changes for existing therapists.
alter table profiles add column if not exists visible_on_team boolean not null default true;

-- Independent of both `active` and `visible_on_team`: a therapist can stay
-- fully visible on the team page while their rating number specifically
-- stays hidden -- e.g. too new to have a representative average yet.
-- Patient rows never use this (patient ratings are never public), but it
-- lives on `profiles` rather than a therapist-only table for the same
-- reason `visible_on_team` does -- one row per person, one place to look.
alter table profiles add column if not exists rating_visible boolean not null default true;

-- Private admin notes about a patient (e.g. "prefers evening slots",
-- "payment dispute resolved 3/15") — deliberately its own table, not a
-- column on profiles, because profiles_select_own lets a patient read
-- every column of their own row; a note column there would leak straight
-- back to the person it's about. This table gets no RLS policies at all,
-- so only the service role (the admin API routes) can ever touch it.
create table if not exists patient_admin_notes (
  patient_id uuid primary key references profiles(id) on delete cascade,
  note text not null default '',
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

alter table patient_admin_notes enable row level security;

-- Same idea as patient_admin_notes, for therapists — kept as its own
-- table rather than a shared one so it stays a plain one-row-per-user
-- upsert on each management page without a role column to filter on.
create table if not exists therapist_admin_notes (
  therapist_id uuid primary key references profiles(id) on delete cascade,
  note text not null default '',
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

alter table therapist_admin_notes enable row level security;

-- The plaintext of the most recent admin-generated password, kept visible
-- to admins (not just shown once) so they can walk a patient/therapist
-- through logging in over a support call. Lives on these zero-RLS-policy
-- tables (service role only) for the same reason admin notes do — a plain
-- column on profiles would leak straight back to the account owner via
-- profiles_select_own. Cleared the moment the user sets their own password
-- through the forgot-password flow (see /api/clear-temp-password), so a
-- once-used support password doesn't linger here forever.
alter table patient_admin_notes add column if not exists temp_password text;
alter table patient_admin_notes add column if not exists temp_password_set_at timestamptz;
alter table therapist_admin_notes add column if not exists temp_password text;
alter table therapist_admin_notes add column if not exists temp_password_set_at timestamptz;

-- Same as patient_admin_notes/therapist_admin_notes, for hospital B2B
-- partner accounts -- added after the fact (the hospital reset-password
-- button originally had nowhere to persist the generated password, so it
-- vanished the moment the admin navigated away, unlike its patient/
-- therapist siblings). No `note` field here since hospitals don't have an
-- equivalent admin-notes UI today -- just the temp password.
create table if not exists hospital_admin_notes (
  hospital_id uuid primary key references profiles(id) on delete cascade,
  temp_password text,
  temp_password_set_at timestamptz
);

alter table hospital_admin_notes enable row level security;

drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles
  for update using (auth.uid() = id);

-- Patient + therapist editable profile fields — added here, before the
-- grant below that references them, since a GRANT UPDATE naming a column
-- that doesn't exist yet fails outright (this file runs top to bottom).
-- avatar_url and the fields below are instant-save; full_name and
-- credentials are approval-required (see profile_change_requests further
-- down).
alter table profiles add column if not exists avatar_url text;
alter table profiles add column if not exists date_of_birth date;
alter table profiles add column if not exists gender text;
alter table profiles add column if not exists emergency_contact_name text;
alter table profiles add column if not exists emergency_contact_phone text;
alter table profiles add column if not exists preferred_language text;
alter table profiles add column if not exists specialization text;
alter table profiles add column if not exists years_experience integer;
alter table profiles add column if not exists bio text;
alter table profiles add column if not exists languages text;

-- A row-level policy only controls *which rows* a user can touch, not
-- *which columns* — without this, any signed-in user could open their
-- browser console and set their own "approved" to true or "role" to
-- 'therapist', bypassing the entire approval gate. Column-level grants
-- close that: "role" and "approved" can only be changed by an admin
-- (via the Supabase Table Editor / service role) or the signup trigger
-- above, which runs with elevated privileges and isn't subject to grants.
--
-- full_name, credentials, and phone are deliberately NOT in this list even
-- though phone was originally included by mistake — all three are
-- identity/trust-sensitive (credentials especially, since patients see it
-- as a therapist's license claim; phone is gated per
-- src/lib/gatedProfileFields.ts), so changing any of them goes through
-- profile_change_requests + admin approval instead of being directly
-- writable. Everything else here is low-risk enough to save immediately.
revoke update on profiles from authenticated;
grant update (
  timezone, avatar_url,
  emergency_contact_name, emergency_contact_phone, preferred_language,
  bio, languages
) on profiles to authenticated;

-- Public-safe subset of approved therapists, for the marketing /team page.
-- A plain RLS policy only controls *which rows* are visible — anon still
-- has table-level SELECT on profiles, so a broad "therapist rows are
-- public" policy would let anyone query email/phone/dates directly with
-- the anon key. This view hard-codes both the row filter and the column
-- allowlist, and (as a view owned by the table owner) applies that filter
-- itself rather than relying on RLS, so it's safe to expose in full.
drop view if exists public_therapist_profiles;
create view public_therapist_profiles as
select id, full_name, credentials, specialization, years_experience, bio, avatar_url
from profiles
where role = 'therapist' and approved = true;

grant select on public_therapist_profiles to anon, authenticated;

-- Appointments: patients and their assigned therapist can see/manage a booking.
drop policy if exists "appointments_select_own" on appointments;
create policy "appointments_select_own" on appointments
  for select using (auth.uid() = patient_id or auth.uid() = therapist_id);

drop policy if exists "appointments_insert_own" on appointments;
create policy "appointments_insert_own" on appointments
  for insert with check (auth.uid() = patient_id);

-- No client-side UPDATE policy on appointments: booking status, therapist
-- assignment, and payment fields (razorpay_order_id, razorpay_payment_id,
-- payment_status) must only ever be written by server-side code using the
-- service role key (see src/lib/supabase/admin.ts) — never by the
-- patient's or therapist's own browser session. Without this, a patient
-- could open devtools and mark their own unpaid booking as "paid" the
-- same way the profile self-approval hole worked before it was fixed.
drop policy if exists "appointments_update_own" on appointments;
revoke update on appointments from authenticated;

-- Records the exact amount actually paid (in paise) at the time of each
-- payment, so hospital revenue-share payouts are computed from what was
-- really charged rather than recalculated later against whatever the
-- session fee constant happens to be at query time.
alter table appointments add column if not exists amount_paid_paise integer;

-- When the payment actually cleared — distinct from created_at (when the
-- booking was first made), since a patient can book now and pay days
-- later. Needed for a real payment history, not just a booking list.
alter table appointments add column if not exists paid_at timestamptz;

-- Tracks whether *this session's* cut has actually been handed to the
-- therapist yet — separate from whether the patient paid. A session with
-- payment_status = 'paid' but therapist_payout_paid_at null is money the
-- clinic owes the therapist and hasn't settled. The amount is snapshotted
-- at settlement time (same reasoning as amount_paid_paise) so editing a
-- therapist's revenue share % later never rewrites what was already
-- actually paid out for past sessions.
alter table appointments add column if not exists therapist_payout_paid_at timestamptz;
alter table appointments add column if not exists therapist_payout_amount_paise integer;
alter table appointments add column if not exists therapist_payout_method text check (therapist_payout_method is null or therapist_payout_method in ('cash', 'online'));
alter table appointments add column if not exists therapist_payout_note text;

-- Set alongside status='completed' by the same "Done" action — a no-show is
-- still a closed-out session (the therapist held the slot, payout eligibility
-- is unchanged), this just records that the patient didn't attend. Deliberately
-- not a new `status` value: everything that already branches on status
-- (payout queries, conflict checks, cancellation guards, dashboards) would
-- otherwise need auditing for a case that doesn't change any of that logic.
alter table appointments add column if not exists no_show boolean not null default false;

-- Post-session ratings/feedback, captured independently from each side once
-- a session is marked completed (the therapist's "Done" action). Rating is
-- required when submitting, feedback is optional free text — enforced in
-- the submit-*-feedback API routes, not here, since there's no single
-- "submit" moment at the column level to hang a check constraint off of.
-- Nothing here is client-writable directly (appointments has no client
-- update policy at all — see below), so these only ever get set by the
-- service-role submit-*-feedback routes after verifying the caller is the
-- patient/therapist on that exact appointment.
alter table appointments add column if not exists patient_rating integer check (patient_rating is null or (patient_rating >= 1 and patient_rating <= 5));
alter table appointments add column if not exists patient_feedback text;
alter table appointments add column if not exists patient_feedback_at timestamptz;
alter table appointments add column if not exists therapist_rating integer check (therapist_rating is null or (therapist_rating >= 1 and therapist_rating <= 5));
alter table appointments add column if not exists therapist_feedback text;
alter table appointments add column if not exists therapist_feedback_at timestamptz;

-- Lets an admin exclude one specific session's rating from every computed
-- average (public /team, admin profile pages, the rated party's own
-- dashboard) without deleting it -- the rating and its feedback text stay
-- fully visible on that session's own record, just outside the math. One
-- flag per side so excluding a patient's rating on a session doesn't touch
-- the therapist's rating on that same session, and vice versa.
alter table appointments add column if not exists patient_rating_excluded boolean not null default false;
alter table appointments add column if not exists therapist_rating_excluded boolean not null default false;

-- Every reassignment (therapist/time/category change) made from the admin
-- Calendar/Session Story views writes one row here recording what it was
-- before and after — the appointments row itself only ever holds current
-- state, so without this there'd be no way to answer "when was this
-- session actually moved, and from what". Service-role only, same as the
-- rest of the admin surface; nothing here is client-writable.
create table if not exists appointment_reassignment_log (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id) on delete cascade,
  changed_by uuid references profiles(id),
  changed_at timestamptz not null default now(),
  old_therapist_id uuid references profiles(id),
  new_therapist_id uuid references profiles(id),
  old_slot_time timestamptz,
  new_slot_time timestamptz,
  -- Deliberately declared without their `references treatment_categories(id)`
  -- foreign keys here: that table is only created further down this file,
  -- so inline FKs made this statement fail on any database where it didn't
  -- already exist -- i.e. every fresh Supabase project. scripts/run-schema.mjs
  -- posts this whole file as a single Management API query, which runs in one
  -- transaction, so that one error rolled back the entire schema and the file
  -- could never be applied from scratch. The constraints are added back
  -- immediately after treatment_categories is created; see
  -- "appointment_reassignment_log_category_fks" below.
  old_category_id uuid,
  new_category_id uuid
);

alter table appointment_reassignment_log enable row level security;

-- Structured contact email captured directly on the public inquiry form,
-- so onboarding doesn't rely on retyping it from free-text notes.
alter table b2b_leads add column if not exists email text;

-- Admin-editable condition categories shown on the public /conditions
-- page. Each one carries its own real price and session length, which
-- drives what /api/razorpay/create-order actually charges when a patient
-- books that specific condition — not a single fixed platform-wide fee.
create table if not exists treatment_categories (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  points jsonb not null default '[]'::jsonb,
  price_paise integer not null,
  duration_minutes integer not null default 60,
  cta_label text not null default 'Book Assessment',
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table treatment_categories enable row level security;

-- The public Conditions page and the booking wizard's concern picker both
-- read this with the regular (non-admin) client, so active categories
-- need to be publicly readable. All writes go through service-role admin
-- API routes only — no client insert/update/delete policy exists.
drop policy if exists "treatment_categories_select_active" on treatment_categories;
create policy "treatment_categories_select_active" on treatment_categories
  for select using (active = true);

-- The two foreign keys appointment_reassignment_log couldn't declare inline,
-- because that table is created earlier in this file than this one. Added
-- here, now that both sides exist. Guarded by name so re-running is a no-op.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'appointment_reassignment_log_old_category_fkey'
  ) then
    alter table appointment_reassignment_log
      add constraint appointment_reassignment_log_old_category_fkey
      foreign key (old_category_id) references treatment_categories(id);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'appointment_reassignment_log_new_category_fkey'
  ) then
    alter table appointment_reassignment_log
      add constraint appointment_reassignment_log_new_category_fkey
      foreign key (new_category_id) references treatment_categories(id);
  end if;
end $$;

-- Seed the two categories that existed as hardcoded content before this
-- table existed, at the platform's original flat fee/duration, so the
-- Conditions page and booking wizard keep working unchanged the moment
-- this migration runs — only guarded to avoid re-seeding on every re-run.
insert into treatment_categories (title, description, points, price_paise, duration_minutes, cta_label, display_order)
select * from (values
  (
    'Spine & Posture Rehabilitation',
    null::text,
    '["Sciatica & radiating leg pain protocols", "Lumbar disc herniation management", "Desk worker neck & upper back decompression"]'::jsonb,
    199900,
    60,
    'Book Spine Assessment',
    1
  ),
  (
    'Post-Surgical Rehabilitation',
    null::text,
    '["ACL & knee ligament recovery milestones", "Total knee and hip replacement follow-ups", "Rotator cuff post-op range of motion restoration"]'::jsonb,
    199900,
    60,
    'Book Post-Op Consultation',
    2
  )
) as seed(title, description, points, price_paise, duration_minutes, cta_label, display_order)
where not exists (select 1 from treatment_categories);

-- Links a booking to the condition category picked in the wizard, so its
-- price is known at payment time. Null for older bookings and for
-- hospital-referred bookings (those describe a free-text medical issue,
-- not a category, and charge the flat base session fee).
alter table appointments add column if not exists category_id uuid references treatment_categories(id);

-- The session length booked, snapshotted at booking time (same reasoning
-- as amount_paid_paise: a category's duration can change later, but a
-- booking already made shouldn't silently change with it). Surfaced to
-- the therapist and admin so an appointment's actual length is known
-- past just the marketing page — not only stored for pricing purposes.
alter table appointments add column if not exists duration_minutes integer;

-- Once categories became admin-curated (rather than a free-text "Other"
-- option), a patient whose issue doesn't match any listed condition had
-- no way to book at all. Guarantees a standing fallback exists — admin
-- can edit its title/price/description/order like any other category,
-- but this keeps re-seeding itself if it's ever deleted entirely, so
-- booking never silently dead-ends.
--
-- Identified by a fixed id, not by title — checking "where title =
-- 'General Consultation'" would re-insert a duplicate the next time this
-- file is re-run if the admin ever renamed it. The id never changes even
-- if the title does, so this stays a no-op once the row exists under any
-- name, and only re-creates it if the row is gone entirely.
--
-- One-time backfill: an earlier version of this migration matched by
-- title instead and would have inserted the row under a random id. Adopt
-- the fixed id for that row instead of inserting a second one.
do $$
begin
  if exists (select 1 from treatment_categories where title = 'General Consultation')
     and not exists (select 1 from treatment_categories where id = '00000000-0000-0000-0000-000000000001'::uuid)
  then
    update treatment_categories
    set id = '00000000-0000-0000-0000-000000000001'::uuid
    where id = (
      select id from treatment_categories
      where title = 'General Consultation'
      order by created_at asc
      limit 1
    );
  end if;
end $$;

insert into treatment_categories (id, title, description, points, price_paise, duration_minutes, cta_label, display_order)
select
  '00000000-0000-0000-0000-000000000001'::uuid,
  'General Consultation',
  'Not sure which category fits? Book a general assessment and we''ll guide you from there.',
  '[]'::jsonb,
  199900,
  60,
  'Book General Consultation',
  999
where not exists (
  select 1 from treatment_categories where id = '00000000-0000-0000-0000-000000000001'::uuid
);

-- Runs both halves of a category-order swap in a single transaction —
-- called by the admin Move Up/Down controls instead of two independent
-- UPDATE statements, so a network blip mid-swap can't leave two
-- categories sharing the same display_order.
create or replace function swap_treatment_category_order(id_a uuid, id_b uuid)
returns void
language plpgsql
as $$
declare
  order_a integer;
  order_b integer;
begin
  select display_order into order_a from treatment_categories where id = id_a;
  select display_order into order_b from treatment_categories where id = id_b;
  update treatment_categories set display_order = order_b where id = id_a;
  update treatment_categories set display_order = order_a where id = id_b;
end;
$$;

-- A patient or therapist requesting a change to an identity/trust-sensitive
-- field (full name, DOB, gender, credentials, specialization, years of
-- experience) doesn't write the profile directly — it lands here pending
-- admin review. "changes" holds one or more {field: new_value} pairs so a
-- single review covers everything they edited in one sitting. Approving
-- applies the change via the service role; declining requires a note so
-- the requester knows why (shown back to them on their profile page).
create table if not exists profile_change_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  changes jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  admin_notes text,
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table profile_change_requests enable row level security;

drop policy if exists "profile_change_requests_select_own" on profile_change_requests;
create policy "profile_change_requests_select_own" on profile_change_requests
  for select using (auth.uid() = user_id);

-- status = 'pending' is required here too, not just as a column default —
-- otherwise a client could insert a row with status already 'approved' or
-- 'declined', faking a reviewed-looking entry in their own history (it
-- can't actually change profiles, since only the admin routes do that and
-- both refuse anything whose status isn't already 'pending', but it would
-- leave a bogus, never-actually-reviewed row behind).
drop policy if exists "profile_change_requests_insert_own" on profile_change_requests;
create policy "profile_change_requests_insert_own" on profile_change_requests
  for insert with check (auth.uid() = user_id and status = 'pending');

-- No client-side UPDATE policy — approving or declining a request (and
-- actually applying an approved change to profiles) only ever happens
-- through the admin API routes using the service role, same reasoning as
-- appointments having no client update policy.
revoke update on profile_change_requests from authenticated;

-- A user can withdraw their own request while it's still pending (changed
-- their mind, made a typo) — but not one already reviewed, so the record
-- of what was approved/declined and why stays intact.
drop policy if exists "profile_change_requests_delete_own_pending" on profile_change_requests;
create policy "profile_change_requests_delete_own_pending" on profile_change_requests
  for delete using (auth.uid() = user_id and status = 'pending');

-- Avatar storage: a public bucket (profile pictures aren't sensitive data
-- and are simplest to serve as plain public URLs) where each user may only
-- write inside a folder named after their own user id — enforced by the
-- policies below, not just convention. Compression happens client-side
-- before upload (see src/lib/compressImage.ts) to keep files small.
insert into storage.buckets (id, name, public)
select 'avatars', 'avatars', true
where not exists (select 1 from storage.buckets where id = 'avatars');

drop policy if exists "avatar_insert_own" on storage.objects;
create policy "avatar_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatar_update_own" on storage.objects;
create policy "avatar_update_own" on storage.objects
  for update using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatar_delete_own" on storage.objects;
create policy "avatar_delete_own" on storage.objects
  for delete using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatar_select_public" on storage.objects;
create policy "avatar_select_public" on storage.objects
  for select using (bucket_id = 'avatars');

-- Admin-curated patient testimonials shown on the public Home page. Same
-- pattern as treatment_categories: publicly readable when active, but all
-- writes go through admin API routes using the service role — no client
-- insert/update/delete policy exists, same reasoning as that table.
create table if not exists testimonials (
  id uuid primary key default gen_random_uuid(),
  patient_name text not null,
  quote text not null,
  rating integer check (rating is null or (rating >= 1 and rating <= 5)),
  condition_label text,
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table testimonials enable row level security;

drop policy if exists "testimonials_select_active" on testimonials;
create policy "testimonials_select_active" on testimonials
  for select using (active = true);

-- Admin-curated FAQ shown on the public /faq page. Same pattern again.
create table if not exists faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table faqs enable row level security;

drop policy if exists "faqs_select_active" on faqs;
create policy "faqs_select_active" on faqs
  for select using (active = true);

-- Cancellation + refund. A patient or admin can cancel an upcoming
-- ('requested'/'confirmed') session; if it was paid, the amount actually
-- charged is refunded via Razorpay as part of the same action (see
-- src/lib/cancelAppointment.ts) — these columns just record what happened,
-- same "server records the outcome" pattern as therapist_payout_* above.
alter table appointments add column if not exists cancelled_at timestamptz;
alter table appointments add column if not exists cancelled_by uuid references profiles(id);
alter table appointments add column if not exists cancellation_reason text;
alter table appointments add column if not exists refund_id text;
alter table appointments add column if not exists refund_status text check (refund_status is null or refund_status in ('processed', 'failed'));
alter table appointments add column if not exists refund_amount_paise integer;

-- 'not_eligible' added for the late-cancellation policy below: a paid
-- session cancelled inside the no-refund window gets this instead of
-- 'processed', so it stays distinguishable from "wasn't paid, so there was
-- never anything to refund" (which leaves refund_status null).
--
-- 'manual_pending' added for Home Visit's cash-on-visit bookings: money
-- collected at the patient's door has no Razorpay payment to reverse, so a
-- cancellation that earns a refund needs a human to hand the cash back, and
-- until they do the row is neither 'processed' nor 'failed'. The admin Cash
-- Ledger turns these into an action queue.
--
-- This list is edited in place rather than widened by a later `alter table`
-- further down the file, which is the usual convention here: this statement
-- re-runs on every apply and would re-impose the narrower list, so a later
-- widening would work exactly once and then fail the next apply with
-- "check constraint is violated by some row" as soon as a real
-- 'manual_pending' row existed.
alter table appointments drop constraint if exists appointments_refund_status_check;
alter table appointments add constraint appointments_refund_status_check
  check (refund_status is null or refund_status in ('processed', 'failed', 'not_eligible', 'manual_pending'));

-- Lets a patient express "book with the same therapist as before" at
-- booking time. Purely a hint for the admin's assignment screen (which
-- still runs its normal conflict check) — never auto-assigns, since the
-- preferred therapist might not actually be available for the requested
-- slot.
alter table appointments add column if not exists preferred_therapist_id uuid references profiles(id);

-- Sitewide switch, separate from any individual therapist's own
-- rating_visible flag: while the platform is young and real review volume
-- is thin, admin can hide rating numbers from every public page at once
-- (new visitors shouldn't see a handful of early reviews before there's
-- enough volume to be representative) without touching each therapist's
-- own setting, which stays intact underneath for whenever this is flipped
-- back on. A real (Postgres has no boolean primary key type restriction
-- beyond the check) singleton: the check constraint makes a second row
-- physically impossible, so "the current settings" is always exactly one
-- unambiguous row, no ORDER BY/LIMIT 1 guesswork anywhere it's read.
create table if not exists site_settings (
  id boolean primary key default true check (id = true),
  ratings_visible_publicly boolean not null default true
);
insert into site_settings (id) values (true) on conflict (id) do nothing;

alter table site_settings enable row level security;
drop policy if exists "site_settings_select_public" on site_settings;
create policy "site_settings_select_public" on site_settings for select using (true);
grant select on site_settings to anon, authenticated;
-- No client insert/update policy -- only the service-role
-- set-ratings-visible-publicly route ever writes this row.

-- Real, aggregated (never per-review) rating data exposed publicly.
-- Deliberately exposes only numbers, never individual patient names or
-- feedback text — publishing real patient reviews/names without an
-- explicit consent step is a separate, bigger decision than this platform
-- currently has a mechanism for; the existing hand-curated `testimonials`
-- table (implied consent obtained manually before an admin types a quote
-- in) remains the only source of individually-attributed public reviews.
--
-- A rating only ever surfaces here when BOTH the global site_settings
-- switch and this specific therapist's own rating_visible flag are true --
-- either one being off is enough to null the numbers out. excluded ratings
-- (patient_rating_excluded) are dropped from the aggregation entirely, same
-- as if they'd never been submitted, while staying intact on the
-- appointment row itself for admin's own view.
drop view if exists public_therapist_profiles;
create view public_therapist_profiles as
select
  p.id, p.full_name, p.credentials, p.specialization, p.years_experience, p.bio, p.avatar_url,
  case when s.ratings_visible_publicly and p.rating_visible then r.avg_rating else null end as avg_rating,
  case when s.ratings_visible_publicly and p.rating_visible then r.rating_count else null end as rating_count
from profiles p
cross join site_settings s
left join (
  select therapist_id, avg(patient_rating)::numeric(3,2) as avg_rating, count(*) as rating_count
  from appointments
  where patient_rating is not null and patient_rating_excluded = false
  group by therapist_id
) r on r.therapist_id = p.id
-- active = true wasn't checked before this migration either, which meant a
-- suspended therapist still showed up on the public /team page — folded
-- into this same view rewrite since it's the same file/view.
-- visible_on_team is a separate, admin-only control: a therapist can stay
-- active (can log in, take bookings) while being hidden from this public
-- page, e.g. on leave or fully booked.
where p.role = 'therapist' and p.approved = true and p.active = true and p.visible_on_team = true;

grant select on public_therapist_profiles to anon, authenticated;

drop view if exists public_rating_summary;
create view public_rating_summary as
select
  case when s.ratings_visible_publicly then agg.avg_rating else null end as avg_rating,
  case when s.ratings_visible_publicly then agg.rating_count else null end as rating_count
from site_settings s
cross join (
  select avg(patient_rating)::numeric(3,2) as avg_rating, count(*) as rating_count
  from appointments
  where patient_rating is not null and patient_rating_excluded = false
) agg;

grant select on public_rating_summary to anon, authenticated;

-- Session packages: a bundle of N sessions in one category at one price,
-- bought upfront. Same public-when-active / service-role-write pattern as
-- treatment_categories.
create table if not exists treatment_category_packages (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references treatment_categories(id) on delete cascade,
  title text not null,
  session_count integer not null check (session_count >= 2),
  price_paise integer not null check (price_paise > 0),
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table treatment_category_packages enable row level security;

drop policy if exists "treatment_category_packages_select_active" on treatment_category_packages;
create policy "treatment_category_packages_select_active" on treatment_category_packages
  for select using (active = true);

-- What a patient actually bought. No client insert/update policy at all —
-- unlike appointments (which starts as a real 'requested'/'unpaid' row a
-- patient legitimately owns before paying), a package purchase only ever
-- makes sense already-paid, so it's created entirely by
-- /api/packages/create-order + /api/packages/verify using the service
-- role, the same way payment fields on appointments are service-role-only.
create table if not exists patient_package_purchases (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references profiles(id) on delete cascade,
  package_id uuid not null references treatment_category_packages(id),
  category_id uuid not null references treatment_categories(id),
  session_count integer not null,
  sessions_used integer not null default 0,
  amount_paid_paise integer,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'failed')),
  razorpay_order_id text,
  razorpay_payment_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

alter table patient_package_purchases enable row level security;

drop policy if exists "package_purchases_select_own" on patient_package_purchases;
create policy "package_purchases_select_own" on patient_package_purchases
  for select using (auth.uid() = patient_id);

-- Links a session that was covered by a package instead of paid for
-- individually — set only by /api/appointments/book-with-package (service
-- role), never by the client-side booking-wizard insert.
alter table appointments add column if not exists package_purchase_id uuid references patient_package_purchases(id);

-- Security fix: the original insert policy only checked patient_id
-- ownership, not the values being inserted — an authenticated patient
-- could craft a raw insert (bypassing the booking wizard entirely) with
-- status: 'confirmed' and payment_status: 'paid' and get a free session,
-- since nothing stopped them from setting those columns themselves at
-- insert time. The booking wizard never sets them to anything but
-- 'requested'/'unpaid'/no-package anyway, so this tightens the check to
-- match actual usage without changing any real behavior. Defined down here
-- (not next to the original policy near the top of the file) because it
-- references package_purchase_id, which doesn't exist as a column until
-- the alter table above runs.
drop policy if exists "appointments_insert_own" on appointments;
create policy "appointments_insert_own" on appointments
  for insert with check (
    auth.uid() = patient_id
    and status = 'requested'
    and payment_status = 'unpaid'
    and package_purchase_id is null
  );

-- Security/integrity fix: the client-side booking wizard only enforces its
-- "at least 12 hours from now" slot picker via the datetime input's `min`
-- attribute -- pure UI, trivially bypassed by anyone crafting their own
-- insert with devtools or a raw REST call (confirmed live: a patient could
-- insert an appointment with slot_time set to days in the past, with the
-- request accepted and no server-side rejection anywhere in the stack).
-- book-with-package's route already guards this server-side for its own
-- path; this closes the same hole for the direct client-side insert, the
-- one path RLS is the only enforcement point for. Only requires slot_time
-- to be in the future (not the full 12-hour minimum the UI advertises) --
-- that stricter promise is specific to the guided booking-wizard copy, not
-- a documented platform-wide rule, so it isn't imposed here on other
-- insert paths that don't make that promise.
-- Security fix: a WITH CHECK clause only constrains the columns it
-- references -- every column NOT listed here (most importantly
-- therapist_id) was previously left completely open on a direct insert.
-- The booking wizard never sets therapist_id at insert time (assignment
-- only ever happens later, server-side, via assign-appointment /
-- assign-referral using the service-role key -- see the comment on the
-- revoked appointments UPDATE grant above), so requiring it to be null
-- here changes no real behavior. Without this, any authenticated patient
-- could craft a raw insert with an arbitrary real therapist_id (readable
-- for free from the public public_therapist_profiles view), pay for it
-- normally, and razorpay/verify's auto-confirm would flip it straight to
-- 'confirmed' -- completely bypassing findTherapistConflict, which is only
-- ever invoked from the admin assignment routes. That produced genuine
-- double-booked, fully-paid "confirmed" sessions with no conflict check
-- anywhere in the path. duration_minutes is pinned to match the chosen
-- category (or the 60-minute base default when no category is set) for
-- the same reason: it was previously any client-supplied integer,
-- including zero/negative, which findTherapistConflict trusts as-is for
-- every other appointment's overlap math.
--
-- The approved check closes the same class of hole for the patient
-- approval gate: a patient signup now starts unapproved and is bounced off
-- /patient/dashboard by the proxy, but that's navigation-only -- a valid
-- session cookie could still raw-insert a booking. Server routes check
-- this too (isProfileActiveAndApproved), this is the database-level backstop.
drop policy if exists "appointments_insert_own" on appointments;
create policy "appointments_insert_own" on appointments
  for insert with check (
    auth.uid() = patient_id
    and status = 'requested'
    and payment_status = 'unpaid'
    and package_purchase_id is null
    and slot_time is not null
    and slot_time > now()
    and therapist_id is null
    and duration_minutes = coalesce(
      (select duration_minutes from treatment_categories where id = category_id),
      60
    )
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and approved = true and active = true
    )
  );

-- Therapist Roster: a weekly recurring availability template a therapist
-- declares for themselves ("every Monday 6-7AM I'm free"), used purely as
-- an admin visibility tool for now -- it does not gate booking or
-- assignment. A row's mere presence means that hour-of-week is enabled;
-- there is no separate boolean, since the whole set is replaced wholesale
-- on every Save (delete-all-then-insert-enabled from
-- /api/therapist/save-availability), so there's never an ambiguous
-- "not yet decided" state to represent.
--
-- hour is the slot's start hour (6-23, i.e. 6AM-7AM .. 11PM-12AM) in the
-- therapist's OWN local time (profiles.timezone) -- deliberately not
-- converted to any shared clock, since a therapist toggling "my Monday
-- morning" means their actual local morning on a platform where
-- therapists aren't all in one timezone.
create table if not exists therapist_availability_template (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references profiles(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0=Sunday .. 6=Saturday, matches JS Date#getDay()
  hour smallint not null check (hour between 6 and 23),
  created_at timestamptz not null default now(),
  unique (therapist_id, day_of_week, hour)
);

alter table therapist_availability_template enable row level security;

drop policy if exists "availability_template_select_own" on therapist_availability_template;
create policy "availability_template_select_own" on therapist_availability_template
  for select using (auth.uid() = therapist_id);
-- Admin reads via the service-role client (createAdminClient), same as
-- every other admin-dashboard query in this app. No client insert/update/
-- delete policy -- writes only go through /api/therapist/save-availability,
-- which confirms auth.uid() against the therapist_id it writes, the same
-- pattern therapist_payout_* columns use for admin-only writes.

-- Date-specific exception on top of the template. Lets admin flip one
-- date+hour to available or unavailable without touching the recurring
-- pattern -- e.g. the therapist agreed to cover one Monday they're not
-- normally on the roster for, or they're out sick one Tuesday they
-- normally are. date is a plain calendar date (not a timestamp), on
-- purpose: a calendar date already unambiguously implies a day-of-week in
-- every timezone, so no conversion is needed to match it against the
-- template above.
--
-- Admin-only for now (no therapist self-service path onto this table yet)
-- -- matches this feature's "visibility tool first" scope.
create table if not exists therapist_availability_override (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references profiles(id) on delete cascade,
  date date not null,
  hour smallint not null check (hour between 6 and 23),
  available boolean not null,
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (therapist_id, date, hour)
);

alter table therapist_availability_override enable row level security;

-- Therapists can see date-specific overrides admin has set for them (e.g.
-- "admin made you available this Tuesday even though you're not normally
-- on the roster then") -- read-only, writes still only ever go through
-- /api/admin/set-availability-override on the service-role client.
drop policy if exists "availability_override_select_own" on therapist_availability_override;
create policy "availability_override_select_own" on therapist_availability_override
  for select using (auth.uid() = therapist_id);

-- A therapist-controlled, date/hour-independent "I'm not available right
-- now" flag -- distinct from the weekly template (which it does NOT clear
-- or modify) and distinct from profiles.active (which gates login/account
-- suspension entirely). Settable by the therapist themselves or by admin
-- on their behalf; when true, every roster view should treat the
-- therapist as unavailable regardless of what the template/overrides say,
-- and flipping it back off simply resumes reading the template as normal
-- -- there's nothing to "restore" since nothing was ever deleted.
alter table profiles add column if not exists on_leave boolean not null default false;

-- Receipts feature -----------------------------------------------------
--
-- A "receipt" for a payment or a completed session is never its own stored
-- row -- it's just the existing appointments/patient_package_purchases row,
-- rendered differently depending on its current status (payment confirmed
-- -> service completed -> cancelled/refunded), matching this codebase's
-- established "pure aggregation over already-fetched data" convention
-- (see src/lib/paymentHistory.ts). Only two genuinely NEW pieces of state
-- are needed to support the rest of the feature: a log of failed payment
-- attempts (nothing captures these today at all) and a way to group the
-- sessions a single payout settlement covered (today each settled
-- appointment only carries its own copy of the same payout timestamp, with
-- nothing tying them together as one event).

-- Logs a failed Razorpay checkout attempt (declined card, bank timeout,
-- etc.) so a patient has somewhere to see *why* a payment didn't go
-- through instead of it just silently vanishing. Deliberately NOT a
-- payment_status transition on appointments/patient_package_purchases --
-- a failed attempt doesn't change the booking's real state (it's still
-- unpaid, still payable via the existing Pay Now flow), it's a separate
-- historical event, and a booking can accumulate more than one failed
-- attempt before eventually succeeding.
create table if not exists payment_failure_log (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references profiles(id),
  appointment_id uuid references appointments(id),
  package_purchase_id uuid references patient_package_purchases(id),
  amount_paise integer,
  razorpay_order_id text,
  razorpay_payment_id text,
  error_code text,
  error_reason text,
  error_description text,
  created_at timestamptz not null default now(),
  constraint payment_failure_log_target_check check (
    (appointment_id is not null and package_purchase_id is null)
    or (appointment_id is null and package_purchase_id is not null)
  )
);

alter table payment_failure_log enable row level security;

drop policy if exists "payment_failure_log_select_own" on payment_failure_log;
create policy "payment_failure_log_select_own" on payment_failure_log
  for select using (auth.uid() = patient_id);

-- No client insert/update/delete policy -- only the service-role
-- /api/razorpay/log-payment-failure route writes these, after verifying
-- the caller actually owns the appointment/package purchase they're
-- reporting a failure against.

-- Groups every appointment settled together in one
-- /api/admin/settle-therapist-payout action, so a payout receipt can list
-- exactly which sessions it covered instead of approximating it by
-- matching timestamps.
create table if not exists therapist_payout_batches (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references profiles(id),
  amount_paise integer not null,
  method text not null,
  note text,
  settled_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

alter table therapist_payout_batches enable row level security;

drop policy if exists "payout_batches_select_own" on therapist_payout_batches;
create policy "payout_batches_select_own" on therapist_payout_batches
  for select using (auth.uid() = therapist_id);

-- No client insert/update/delete policy -- only settle-therapist-payout
-- (service role) writes these.

alter table appointments add column if not exists therapist_payout_batch_id uuid references therapist_payout_batches(id);

-- Unique display IDs ------------------------------------------------------
--
-- Short, human-readable, sequential IDs for tracking a patient, therapist,
-- hospital, or session in conversation/support/finance contexts, where a
-- uuid is unusable. Format: <PREFIX><4+ digit zero-padded number>, e.g.
-- PT0001, TH0001, BB0001, SS0001 -- assigned in the order each row was
-- created (oldest = 0001), one independent counter per kind so a new
-- patient never "uses up" a number from the therapist or session series.
--
-- Each is a plain generated value, not the row's primary key -- the uuid
-- keeps being the real identity/foreign-key column everywhere; these are
-- purely a friendlier label layered on top.

create sequence if not exists patient_code_seq;
create sequence if not exists therapist_code_seq;
create sequence if not exists hospital_code_seq;
create sequence if not exists session_code_seq;

alter table profiles add column if not exists patient_code text;
alter table profiles add column if not exists therapist_code text;
alter table profiles add column if not exists hospital_code text;
alter table appointments add column if not exists session_code text;

-- Assigns the right code on INSERT based on the new row's role -- covers
-- both the self-signup trigger (handle_new_user) and any admin-created
-- profile, without either of those needing to know this scheme exists.
create or replace function assign_profile_code() returns trigger as $$
begin
  if new.role = 'patient' and new.patient_code is null then
    new.patient_code := 'PT' || lpad(nextval('patient_code_seq')::text, 4, '0');
  elsif new.role = 'therapist' and new.therapist_code is null then
    new.therapist_code := 'TH' || lpad(nextval('therapist_code_seq')::text, 4, '0');
  elsif new.role = 'hospital' and new.hospital_code is null then
    new.hospital_code := 'BB' || lpad(nextval('hospital_code_seq')::text, 4, '0');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_assign_profile_code on profiles;
create trigger trg_assign_profile_code
  before insert on profiles
  for each row execute function assign_profile_code();

create or replace function assign_session_code() returns trigger as $$
begin
  if new.session_code is null then
    new.session_code := 'SS' || lpad(nextval('session_code_seq')::text, 4, '0');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_assign_session_code on appointments;
create trigger trg_assign_session_code
  before insert on appointments
  for each row execute function assign_session_code();

-- Backfill every row that predates these triggers, oldest first, then
-- advance each sequence to the highest code number actually in use so the
-- next real INSERT continues the same series instead of colliding with it.
-- The backfill itself is guarded by "is null", so it only ever touches rows
-- that predate the triggers. Numbering starts from the current max existing
-- code (not from 1) -- a plain row_number() over just the null rows repeats
-- 1, 2, 3... on every run, which collided with already-assigned codes the
-- moment any new codeless row showed up after the first successful backfill
-- (e.g. inserted before this trigger existed on a given database). The
-- setval calls are deliberately NOT based on row count: count(*) looks
-- equivalent right after a fresh backfill, but silently regresses every
-- sequence backward the moment any row of that role/table is ever deleted
-- afterward -- the next real signup/booking would then collide with a still-
-- existing higher-numbered code and fail with a duplicate-key error.
-- Deriving from max(existing code number) instead means this block is
-- genuinely idempotent and safe to re-run at any time, no matter how many
-- rows have since been deleted or how many codeless rows accumulate between
-- runs.
-- Bug fix (found by running this file against an empty database): each
-- setval below used to be called as setval(seq, coalesce(max, 0), true).
-- On a database with no rows of that kind yet -- i.e. every fresh
-- Supabase project, which is exactly what the README tells you to run
-- this file on -- the coalesce yields 0, and a sequence's MINVALUE is 1,
-- so postgres raises "setval: value 0 is out of bounds" and aborts the
-- whole script. setval(seq, 1, false) is the correct way to express "the
-- next nextval should return 1", so `m` is captured once per series and
-- the is_called flag is derived from whether any code actually exists.
do $$
declare
  m integer;
begin
  if exists (select 1 from profiles where role = 'patient' and patient_code is null) then
    with existing_max as (
      select coalesce(max(substring(patient_code from 3)::int), 0) as n
      from profiles where role = 'patient'
    ),
    ordered as (
      select id, row_number() over (order by created_at asc, id asc) as rn
      from profiles where role = 'patient' and patient_code is null
    )
    update profiles p set patient_code = 'PT' || lpad((ordered.rn + existing_max.n)::text, 4, '0')
    from ordered, existing_max where p.id = ordered.id;
  end if;
  select coalesce(max(substring(patient_code from 3)::int), 0) into m
    from profiles where role = 'patient';
  perform setval('patient_code_seq', greatest(m, 1), m > 0);

  if exists (select 1 from profiles where role = 'therapist' and therapist_code is null) then
    with existing_max as (
      select coalesce(max(substring(therapist_code from 3)::int), 0) as n
      from profiles where role = 'therapist'
    ),
    ordered as (
      select id, row_number() over (order by created_at asc, id asc) as rn
      from profiles where role = 'therapist' and therapist_code is null
    )
    update profiles p set therapist_code = 'TH' || lpad((ordered.rn + existing_max.n)::text, 4, '0')
    from ordered, existing_max where p.id = ordered.id;
  end if;
  select coalesce(max(substring(therapist_code from 3)::int), 0) into m
    from profiles where role = 'therapist';
  perform setval('therapist_code_seq', greatest(m, 1), m > 0);

  if exists (select 1 from profiles where role = 'hospital' and hospital_code is null) then
    with existing_max as (
      select coalesce(max(substring(hospital_code from 3)::int), 0) as n
      from profiles where role = 'hospital'
    ),
    ordered as (
      select id, row_number() over (order by created_at asc, id asc) as rn
      from profiles where role = 'hospital' and hospital_code is null
    )
    update profiles p set hospital_code = 'BB' || lpad((ordered.rn + existing_max.n)::text, 4, '0')
    from ordered, existing_max where p.id = ordered.id;
  end if;
  select coalesce(max(substring(hospital_code from 3)::int), 0) into m
    from profiles where role = 'hospital';
  perform setval('hospital_code_seq', greatest(m, 1), m > 0);

  if exists (select 1 from appointments where session_code is null) then
    with existing_max as (
      select coalesce(max(substring(session_code from 3)::int), 0) as n
      from appointments
    ),
    ordered as (
      select id, row_number() over (order by created_at asc, id asc) as rn
      from appointments where session_code is null
    )
    update appointments a set session_code = 'SS' || lpad((ordered.rn + existing_max.n)::text, 4, '0')
    from ordered, existing_max where a.id = ordered.id;
  end if;
  select coalesce(max(substring(session_code from 3)::int), 0) into m
    from appointments;
  perform setval('session_code_seq', greatest(m, 1), m > 0);
end $$;

create unique index if not exists profiles_patient_code_unique_idx
  on profiles (patient_code) where patient_code is not null;
create unique index if not exists profiles_therapist_code_unique_idx
  on profiles (therapist_code) where therapist_code is not null;
create unique index if not exists profiles_hospital_code_unique_idx
  on profiles (hospital_code) where hospital_code is not null;
create unique index if not exists appointments_session_code_unique_idx
  on appointments (session_code) where session_code is not null;

-- Therapist payout requests -------------------------------------------------
--
-- A therapist's own accrued-but-unsettled earnings (session status
-- 'completed' + payment_status 'paid', not yet given a
-- therapist_payout_paid_at) are computed on the fly from appointments --
-- see settle-therapist-payout's own owed formula, reused verbatim by
-- src/lib/therapistEarnings.ts. This table only records the one new piece
-- of real state needed on top of that: a therapist explicitly asking to be
-- paid, and an admin explicitly acknowledging that request has been
-- fulfilled (the actual settlement still happens the existing way, via the
-- Payouts tab / settle-therapist-payout -- this is a lightweight request/ack
-- loop layered on top, not a new payment mechanism).
create table if not exists therapist_payout_requests (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references profiles(id) on delete cascade,
  requested_amount_paise integer not null,
  status text not null default 'pending' check (status in ('pending', 'completed')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by uuid references profiles(id),
  acknowledged_at timestamptz
);

-- At most one open request per therapist at a time -- backstops the
-- "Request Payout" button being disabled client-side while one is pending.
create unique index if not exists payout_requests_one_pending_idx
  on therapist_payout_requests (therapist_id) where status = 'pending';

alter table therapist_payout_requests enable row level security;

drop policy if exists "payout_requests_select_own" on therapist_payout_requests;
create policy "payout_requests_select_own" on therapist_payout_requests
  for select using (auth.uid() = therapist_id);
-- No client insert/update/delete policy -- only
-- /api/therapist/request-payout, /api/therapist/acknowledge-payout-request,
-- and /api/admin/complete-payout-request (all service-role) write this table.

-- "Reviewing" stage -- an explicit middle state between the therapist
-- asking to be paid and the admin actually confirming payment, so the
-- therapist can see "someone's on it" rather than just "request pending"
-- for the entire duration. /api/admin/start-review-payout-request moves
-- pending -> reviewing; /api/admin/complete-payout-request now only accepts
-- reviewing -> completed (rejects a stale pending -> completed jump).
alter table therapist_payout_requests add column if not exists reviewing_at timestamptz;
alter table therapist_payout_requests add column if not exists reviewing_by uuid references profiles(id);

alter table therapist_payout_requests drop constraint if exists therapist_payout_requests_status_check;
alter table therapist_payout_requests add constraint therapist_payout_requests_status_check
  check (status in ('pending', 'reviewing', 'completed'));

-- Widened from "pending only" to "pending or reviewing" -- an open request
-- being reviewed still blocks a second one, same as a plain pending one did.
drop index if exists payout_requests_one_pending_idx;
create unique index if not exists payout_requests_one_open_idx
  on therapist_payout_requests (therapist_id) where status in ('pending', 'reviewing');

-- Google Calendar / Meet integration. A dedicated Calendar event (with an
-- auto-generated Meet link) is created once a session is confirmed with a
-- therapist assigned, updated in place on reassignment/reschedule, and
-- deleted on cancellation (see src/lib/googleCalendar.ts). Left untouched on
-- completion -- it's a harmless historical record and lets the Join button
-- go straight back to working if the session is ever reopened.
-- google_calendar_sync_error records the last Calendar-API failure message
-- (if any), so a confirmed session that never got a Meet link is visible
-- from inside the app, not just in server logs.
alter table appointments add column if not exists google_event_id text;
alter table appointments add column if not exists meet_link text;
alter table appointments add column if not exists google_calendar_sync_error text;

-- Distinguishes an admin-recorded cash payment from a normal online
-- Razorpay charge -- null/'razorpay' for the existing online-payment path
-- (never written to explicitly), 'cash' for /api/admin/mark-paid-by-cash.
-- razorpay_payment_id staying null already implies "not online", but this
-- makes it an explicit, queryable fact rather than an inferred one.
alter table appointments add column if not exists payment_method text;

-- Admin Feature Control (Feature 16): two more columns on the existing
-- site_settings singleton (see its own definition/comment above) rather
-- than a new table -- same "one guaranteed row" pattern as
-- ratings_visible_publicly. Every dashboard (patient/therapist/hospital/
-- admin) reads these with its own regular (non-admin) client to apply e.g.
-- the idle-timeout minutes client-side -- site_settings is already publicly
-- readable (see site_settings_select_public above), so no new RLS policy is
-- needed. All writes go through the service-role
-- /api/admin/update-setting route only, same as ratings_visible_publicly's
-- own route.
alter table site_settings add column if not exists session_packages_visible boolean not null default true;
alter table site_settings add column if not exists session_timeout_minutes integer not null default 0;

-- Google Meet/Calendar admin controls (Feature Control tab): master kill
-- switch for auto Meet-link creation, and how many minutes before slot_time
-- the Tap to Join button activates. OAuth credentials/calendar ID stay in
-- env vars, never DB-stored -- these two are the only non-secret,
-- operationally-safe knobs to expose in the admin UI.
alter table site_settings add column if not exists google_meet_enabled boolean not null default true;
alter table site_settings add column if not exists join_window_minutes integer not null default 15;
-- How many minutes after a session's slot_time + duration_minutes the Join
-- button stays active for patient/therapist -- admin's own Join button
-- ignores both this and join_window_minutes entirely (see JoinSessionButton's
-- alwaysActive prop), since an admin should always be able to check a
-- session's Meet link/call.
alter table site_settings add column if not exists join_window_after_minutes integer not null default 15;

-- Specialist Team profile popup (Feature 38): an admin-curated public blurb
-- shown alongside the therapist's own self-reported bio/credentials in the
-- /team popup, distinct from therapist_admin_notes (private, never public)
-- and from `bio` (self-edited by the therapist, gated via the normal
-- profile-change-request flow). Only an admin can ever write this -- see
-- /api/admin/update-therapist-display-content -- so it needs no gating of
-- its own beyond that route's admin check.
alter table profiles add column if not exists public_display_note text;

-- Re-create (not just alter) since a view's column list is fixed at
-- creation -- same convention as every other public_therapist_profiles
-- edit above. Identical to the previous definition, with
-- public_display_note added to the select list.
drop view if exists public_therapist_profiles;
create view public_therapist_profiles as
select
  p.id, p.full_name, p.credentials, p.specialization, p.years_experience, p.bio, p.avatar_url,
  p.languages, p.public_display_note,
  case when s.ratings_visible_publicly and p.rating_visible then r.avg_rating else null end as avg_rating,
  case when s.ratings_visible_publicly and p.rating_visible then r.rating_count else null end as rating_count
from profiles p
cross join site_settings s
left join (
  select therapist_id, avg(patient_rating)::numeric(3,2) as avg_rating, count(*) as rating_count
  from appointments
  where patient_rating is not null and patient_rating_excluded = false
  group by therapist_id
) r on r.therapist_id = p.id
where p.role = 'therapist' and p.approved = true and p.active = true and p.visible_on_team = true;

grant select on public_therapist_profiles to anon, authenticated;

-- Live dashboard updates (RealtimeRefresh component): admin's browser
-- session needs read access to rows it doesn't own (a payout request from
-- a therapist, a referral from a hospital, a new therapist signup) so a
-- Realtime subscription authenticated as admin actually receives events
-- for them -- the existing *_select_own policies below only ever matched
-- auth.uid() against patient_id/therapist_id/hospital_id, which excludes
-- admin entirely. security definer so the policies below (including the
-- one on profiles itself) don't recurse back into profiles' own RLS.
create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

drop policy if exists "appointments_select_admin" on appointments;
create policy "appointments_select_admin" on appointments
  for select using (is_admin());

drop policy if exists "payout_requests_select_admin" on therapist_payout_requests;
create policy "payout_requests_select_admin" on therapist_payout_requests
  for select using (is_admin());

drop policy if exists "patient_referrals_select_admin" on patient_referrals;
create policy "patient_referrals_select_admin" on patient_referrals
  for select using (is_admin());

drop policy if exists "b2b_leads_select_admin" on b2b_leads;
create policy "b2b_leads_select_admin" on b2b_leads
  for select using (is_admin());

drop policy if exists "profiles_select_admin" on profiles;
create policy "profiles_select_admin" on profiles
  for select using (is_admin());

drop policy if exists "profile_change_requests_select_admin" on profile_change_requests;
create policy "profile_change_requests_select_admin" on profile_change_requests
  for select using (is_admin());

-- Actually turns on the postgres_changes stream for the tables above --
-- without this, RealtimeRefresh's subscription connects successfully but
-- Supabase never emits an event for it, regardless of RLS. Wrapped in a
-- DO block so re-running this file doesn't error on tables already added.
do $$
begin
  alter publication supabase_realtime add table appointments;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table therapist_payout_requests;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table patient_referrals;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table b2b_leads;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table profiles;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table profile_change_requests;
exception when duplicate_object then null;
end $$;

-- Performance: non-unique indexes for the app's highest-traffic filters/
-- joins. Every one of these columns was previously scanned sequentially --
-- .eq("role", ...) alone appears at ~28 call sites across the codebase.
create index if not exists appointments_patient_id_idx on appointments (patient_id);
create index if not exists appointments_therapist_id_idx on appointments (therapist_id);
create index if not exists appointments_status_idx on appointments (status);
create index if not exists appointments_slot_time_idx on appointments (slot_time);
create index if not exists profiles_role_idx on profiles (role);
create index if not exists profiles_role_approved_idx on profiles (role, approved);
create index if not exists profiles_referred_by_hospital_id_idx on profiles (referred_by_hospital_id);
create index if not exists patient_referrals_hospital_id_idx on patient_referrals (hospital_id);
create index if not exists patient_referrals_status_idx on patient_referrals (status);
create index if not exists therapist_payout_requests_therapist_id_idx on therapist_payout_requests (therapist_id);

-- Booking Languages (Feature Control tab): the list of preferred-language
-- chips offered in /book Step 1. Stored as jsonb on the site_settings
-- singleton rather than a new table -- it's a short, ordered, admin-curated
-- list with no per-row metadata, same reasoning as the other Feature
-- Control columns above. Publicly readable via site_settings_select_public
-- so the (ISR-cached, anon-client) /book page can render the chips without
-- an authenticated round trip; writes still go only through the
-- service-role /api/admin/update-setting route.
--
-- Defaults to ["English"] so booking always has at least one selectable
-- language before an admin configures anything; parseBookingLanguages()
-- applies the same fallback client-side if the list is ever emptied.
alter table site_settings add column if not exists booking_languages jsonb not null default '["English"]'::jsonb;

-- Patient's preferred session language, captured in /book Step 1 alongside
-- date/time. Nullable and additive: existing rows (and any booking made
-- before this column existed) simply carry no stated preference.
alter table appointments add column if not exists preferred_language text;

-- ============================================================================
-- Session Packages v2: a package is a sellable programme (image, promises,
-- discount math, therapist continuity, validity), not just a bundle of N
-- sessions at a price. This section turns treatment_category_packages and
-- patient_package_purchases into that -- see the Session Manager admin tab
-- and the "Session Packages" section on the public site for the surfaces
-- that read these columns.
-- ============================================================================

-- Human-readable, permanent ID for a catalog product -- same idea as the
-- PT####/TH####/BB####/SS#### codes assigned above, just for the package
-- itself. Quoted in support conversations and shown read-only in the
-- admin catalog form.
create sequence if not exists package_code_seq;
alter table treatment_category_packages add column if not exists package_code text;

-- Card copy. subtitle is the one-liner under the name; description is the
-- paragraph on the expanded/detail view; promises mirrors
-- treatment_categories.points (same jsonb-array-of-strings shape, same
-- reasoning: a short admin-curated list with no per-row metadata).
alter table treatment_category_packages add column if not exists subtitle text;
alter table treatment_category_packages add column if not exists description text;
alter table treatment_category_packages add column if not exists image_url text;
alter table treatment_category_packages add column if not exists promises jsonb not null default '[]'::jsonb;
alter table treatment_category_packages add column if not exists badge_label text;
alter table treatment_category_packages add column if not exists highlight boolean not null default false;
alter table treatment_category_packages add column if not exists terms text;

-- The "was ₹X" struck-through price. Nullable on purpose: when null, every
-- surface that renders it computes session_count * treatment_categories
-- .price_paise instead, so the advertised saving can never contradict the
-- category's real per-session price. Set explicitly only to advertise a
-- saving deeper than the category's list price would produce.
alter table treatment_category_packages add column if not exists compare_at_paise integer;
alter table treatment_category_packages drop constraint if exists treatment_category_packages_compare_at_check;
alter table treatment_category_packages
  add constraint treatment_category_packages_compare_at_check
  check (compare_at_paise is null or compare_at_paise >= price_paise);

-- Programme rules. validity_days/session_duration_minutes null through to
-- the site_settings default / the category's own duration respectively --
-- see parseAdminSettings() and the booking wizard's package mode.
-- therapist_locked is the per-package switch for the continuity promise;
-- the site-wide kill switch is site_settings.package_therapist_lock_enabled
-- below, and either one being off skips locking.
alter table treatment_category_packages add column if not exists validity_days integer check (validity_days is null or validity_days > 0);
alter table treatment_category_packages add column if not exists session_duration_minutes integer check (session_duration_minutes is null or session_duration_minutes > 0);
alter table treatment_category_packages add column if not exists therapist_locked boolean not null default true;
alter table treatment_category_packages add column if not exists min_gap_hours integer check (min_gap_hours is null or min_gap_hours > 0);
alter table treatment_category_packages add column if not exists max_sessions_per_week integer check (max_sessions_per_week is null or max_sessions_per_week > 0);
alter table treatment_category_packages add column if not exists max_purchases_per_patient integer check (max_purchases_per_patient is null or max_purchases_per_patient > 0);

-- Whether a package session's therapist payout is computed on the
-- discounted per-session amount actually collected (the historical
-- behaviour: amount_paid_paise / session_count) or on the category's full
-- list price, letting the business absorb the bundle discount instead of
-- passing it to the therapist. Read by src/lib/therapistEarnings.ts /
-- therapistPayouts.ts once a package session's payout is computed.
alter table treatment_category_packages add column if not exists therapist_rate_basis text
  not null default 'package_actual'
  check (therapist_rate_basis in ('package_actual', 'category_list'));

-- Where the package is offered. active (existing column) is the master
-- switch; these three narrow *which* active surfaces show it, independent
-- of each other -- a package can be dashboard-only, for instance.
alter table treatment_category_packages add column if not exists visible_on_home boolean not null default true;
alter table treatment_category_packages add column if not exists visible_on_conditions boolean not null default true;
alter table treatment_category_packages add column if not exists visible_in_dashboard boolean not null default true;

create or replace function assign_package_code() returns trigger as $$
begin
  if new.package_code is null then
    new.package_code := 'PK' || lpad(nextval('package_code_seq')::text, 4, '0');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_assign_package_code on treatment_category_packages;
create trigger trg_assign_package_code
  before insert on treatment_category_packages
  for each row execute function assign_package_code();

-- Backfill existing packages (oldest first) and advance the sequence past
-- the highest code actually in use -- same idempotent, deletion-safe
-- pattern as the patient/therapist/hospital/session code backfills above
-- (derived from max(existing code number), never count(*)).
do $$
declare
  m integer;
begin
  if exists (select 1 from treatment_category_packages where package_code is null) then
    with ordered as (
      select id, row_number() over (order by created_at asc, id asc) as rn
      from treatment_category_packages where package_code is null
    )
    update treatment_category_packages p set package_code = 'PK' || lpad(ordered.rn::text, 4, '0')
    from ordered where p.id = ordered.id;
  end if;
  -- See the "setval: value 0 is out of bounds" comment on the profile
  -- code backfill above for why this is not setval(seq, 0, true).
  select coalesce(max(substring(package_code from 3)::int), 0) into m
    from treatment_category_packages;
  perform setval('package_code_seq', greatest(m, 1), m > 0);
end $$;

create unique index if not exists treatment_category_packages_code_unique_idx
  on treatment_category_packages (package_code) where package_code is not null;

-- What a patient bought, extended: a purchase code (the "package ID" shown
-- on the admin Purchases table -- PK#### identifies the product, this
-- identifies the sale), the therapist locked onto the whole programme,
-- an expiry window, and a stored lifecycle status.
create sequence if not exists purchase_code_seq;
alter table patient_package_purchases add column if not exists purchase_code text;

-- Set the first time any session on this purchase gets a therapist
-- assigned (see /api/admin/assign-appointment and
-- src/lib/bookPackageSession.ts). Every later session on the same
-- purchase auto-assigns this therapist rather than going through the
-- normal admin assignment queue -- the continuity promise the package is
-- sold on. on delete set null so a deleted therapist profile doesn't
-- take the purchase row down with it.
alter table patient_package_purchases add column if not exists locked_therapist_id uuid references profiles(id) on delete set null;

alter table patient_package_purchases add column if not exists expires_at timestamptz;

-- Stored rather than purely derived so the admin Purchases table can
-- filter/index on it directly. Kept in step by the same service-role
-- routes that move sessions_used -- see the counter-semantics comment
-- below for exactly what each status/count means.
alter table patient_package_purchases add column if not exists status text
  not null default 'active'
  check (status in ('active', 'completed', 'expired', 'refunded', 'cancelled'));

alter table patient_package_purchases add column if not exists notes text;
alter table patient_package_purchases add column if not exists expiry_extended_at timestamptz;
alter table patient_package_purchases add column if not exists expiry_extended_by uuid references profiles(id);
alter table patient_package_purchases add column if not exists expiry_extension_reason text;
alter table patient_package_purchases add column if not exists refund_amount_paise integer;
alter table patient_package_purchases add column if not exists refunded_at timestamptz;
alter table patient_package_purchases add column if not exists refund_id text;

create or replace function assign_purchase_code() returns trigger as $$
begin
  if new.purchase_code is null then
    new.purchase_code := 'SP' || lpad(nextval('purchase_code_seq')::text, 4, '0');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_assign_purchase_code on patient_package_purchases;
create trigger trg_assign_purchase_code
  before insert on patient_package_purchases
  for each row execute function assign_purchase_code();

-- Backfill: same idempotent, max()-derived pattern as every other code
-- sequence in this file. Also backfills status for pre-existing rows --
-- fully consumed purchases become 'completed', everything else 'active',
-- since none of them can be 'expired'/'refunded'/'cancelled' without the
-- columns that record why (those only ever get set going forward).
do $$
declare
  m integer;
begin
  if exists (select 1 from patient_package_purchases where purchase_code is null) then
    with ordered as (
      select id, row_number() over (order by created_at asc, id asc) as rn
      from patient_package_purchases where purchase_code is null
    )
    update patient_package_purchases p set purchase_code = 'SP' || lpad(ordered.rn::text, 4, '0')
    from ordered where p.id = ordered.id;
  end if;
  -- See the "setval: value 0 is out of bounds" comment on the profile
  -- code backfill above for why this is not setval(seq, 0, true).
  select coalesce(max(substring(purchase_code from 3)::int), 0) into m
    from patient_package_purchases;
  perform setval('purchase_code_seq', greatest(m, 1), m > 0);

  update patient_package_purchases
  set status = 'completed'
  where status = 'active' and sessions_used >= session_count and session_count > 0;
end $$;

create unique index if not exists patient_package_purchases_code_unique_idx
  on patient_package_purchases (purchase_code) where purchase_code is not null;

create index if not exists patient_package_purchases_patient_id_idx on patient_package_purchases (patient_id);
create index if not exists patient_package_purchases_locked_therapist_id_idx on patient_package_purchases (locked_therapist_id);
create index if not exists patient_package_purchases_status_idx on patient_package_purchases (status);
create index if not exists patient_package_purchases_expires_at_idx on patient_package_purchases (expires_at);

-- The existing package_purchases_select_own policy only covers the
-- patient who owns the purchase; the admin Session Manager tab needs to
-- read every purchase. Mirrors appointments_select_admin above, reusing
-- the same is_admin() helper so this doesn't recurse back into profiles'
-- own RLS.
drop policy if exists "package_purchases_select_admin" on patient_package_purchases;
create policy "package_purchases_select_admin" on patient_package_purchases
  for select using (is_admin());

-- The therapist locked onto a programme needs to see it on their own
-- dashboard's Programme Patients section -- same "assigned party can read
-- it" shape as appointments_select_own's therapist_id half above.
drop policy if exists "package_purchases_select_locked_therapist" on patient_package_purchases;
create policy "package_purchases_select_locked_therapist" on patient_package_purchases
  for select using (auth.uid() = locked_therapist_id);

-- Counter semantics (depended on by the patient widget, the admin
-- Purchases table, and the therapist Programme Patients list -- keep
-- these three in agreement with this comment, not with each other):
--   sessions_used   = sessions CLAIMED: scheduled or completed. This is
--                      exactly what the CAS claim in
--                      src/lib/bookPackageSession.ts increments/decrements.
--   completed       = appointments on this purchase with status='completed'
--   scheduled       = appointments on this purchase with
--                      status in ('requested','confirmed') and slot_time
--                      in the future
--   pending         = session_count - sessions_used
-- A cancellation outside the 24-hour refund window (see
-- CANCELLATION_FULL_REFUND_HOURS in src/lib/pricing.ts) decrements
-- sessions_used, so pending correctly grows back; a late cancellation
-- forfeits the session and leaves sessions_used untouched.

-- Audit trail for a purchase's whole lifecycle -- mirrors
-- appointment_reassignment_log above, but for events a single
-- appointment_id can't capture (a purchase, a therapist lock, an expiry
-- extension). Powers the timeline in the admin package detail popup.
-- Service-role only, same as appointment_reassignment_log.
create table if not exists package_purchase_events (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references patient_package_purchases(id) on delete cascade,
  event_type text not null check (event_type in (
    'purchased', 'session_scheduled', 'session_cancelled', 'session_completed',
    'session_restored', 'therapist_locked', 'therapist_reassigned',
    'expiry_extended', 'refunded', 'expired'
  )),
  actor_id uuid references profiles(id),
  appointment_id uuid references appointments(id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table package_purchase_events enable row level security;

drop policy if exists "package_purchase_events_select_own" on package_purchase_events;
create policy "package_purchase_events_select_own" on package_purchase_events
  for select using (
    exists (
      select 1 from patient_package_purchases pp
      where pp.id = package_purchase_events.purchase_id and pp.patient_id = auth.uid()
    )
  );

drop policy if exists "package_purchase_events_select_admin" on package_purchase_events;
create policy "package_purchase_events_select_admin" on package_purchase_events
  for select using (is_admin());

create index if not exists package_purchase_events_purchase_id_idx on package_purchase_events (purchase_id);

-- One row per purchase with the derived counts every list view needs, so
-- the admin Purchases table and the therapist Programme Patients list
-- don't each run their own N+1 across appointments. security_invoker so
-- it respects the caller's own RLS (patient sees their own row via
-- package_purchases_select_own, the locked therapist sees theirs via
-- package_purchases_select_locked_therapist, admin sees every row via
-- package_purchases_select_admin) rather than the view owner's.
--
-- Deliberately does NOT join profiles for the patient's or therapist's
-- name -- profiles_select_own only lets a caller read their own row, so
-- that join would silently come back null for every other viewer, same
-- trap documented on the patient dashboard's therapist-name lookup.
-- Every consumer resolves patient_id/locked_therapist_id to a name the
-- same way the dashboards already resolve therapist_id today: a
-- follow-up admin-client lookup, gated by the page already being behind
-- the proxy/requireAdmin check -- see patient/dashboard/page.tsx's
-- therapistMap for the pattern to copy.
create or replace view package_purchase_summary
  with (security_invoker = true) as
select
  pp.id,
  pp.purchase_code,
  pp.patient_id,
  pp.package_id,
  pp.category_id,
  pp.session_count,
  pp.sessions_used,
  pp.amount_paid_paise,
  pp.payment_status,
  pp.status,
  pp.locked_therapist_id,
  pp.expires_at,
  pp.paid_at,
  pp.created_at,
  coalesce(a.completed_count, 0) as completed_count,
  coalesce(a.scheduled_count, 0) as scheduled_count,
  greatest(pp.session_count - pp.sessions_used, 0) as pending_count,
  a.next_slot_time
from patient_package_purchases pp
left join lateral (
  select
    count(*) filter (where ap.status = 'completed') as completed_count,
    count(*) filter (where ap.status in ('requested', 'confirmed') and ap.slot_time > now()) as scheduled_count,
    min(ap.slot_time) filter (where ap.status in ('requested', 'confirmed') and ap.slot_time > now()) as next_slot_time
  from appointments ap
  where ap.package_purchase_id = pp.id
) a on true;

grant select on package_purchase_summary to authenticated;

-- Session Manager (Feature Control's former Session Packages toggle moved
-- here, plus new package-wide defaults). session_packages_visible itself
-- already exists above and keeps its column/meaning -- only which admin
-- tab controls it changes.
alter table site_settings add column if not exists package_default_validity_days integer not null default 90 check (package_default_validity_days > 0);
alter table site_settings add column if not exists package_therapist_lock_enabled boolean not null default true;
alter table site_settings add column if not exists package_bulk_schedule_max integer not null default 8 check (package_bulk_schedule_max > 0);
alter table site_settings add column if not exists package_expiry_reminder_days integer not null default 14 check (package_expiry_reminder_days >= 0);

-- Live-refreshes the admin Purchases table (RealtimeRefresh) the same way
-- appointments/profiles/etc. already do above -- a patient paying for a
-- package, or another admin session extending/refunding one, shows up
-- without a manual reload. Same duplicate-object-safe DO block idiom.
do $$
begin
  alter publication supabase_realtime add table patient_package_purchases;
exception when duplicate_object then null;
end $$;

-- package_purchase_events was only ever given a patient-facing select
-- policy (package_purchase_events_select_own) -- unlike
-- patient_package_purchases itself, which has both _select_own AND
-- _select_locked_therapist. That gap meant the locked therapist's own
-- PackageDetailModal timeline silently came back empty (RLS filtered it
-- to nothing, not an error), even though there's no privacy reason to
-- withhold a programme's own event history (scheduled/locked/reassigned)
-- from the therapist actually running it -- it's operational context, not
-- money. Mirrors package_purchases_select_locked_therapist exactly.
drop policy if exists "package_purchase_events_select_locked_therapist" on package_purchase_events;
create policy "package_purchase_events_select_locked_therapist" on package_purchase_events
  for select using (
    exists (
      select 1 from patient_package_purchases pp
      where pp.id = package_purchase_events.purchase_id and pp.locked_therapist_id = auth.uid()
    )
  );

-- Every table the admin dashboard's big Promise.all (src/app/admin/dashboard/
-- page.tsx) reads that wasn't already streaming -- ADMIN_REALTIME_TABLES in
-- AdminTabs.tsx previously covered only 7 of the ~17 tables that page
-- actually queries, so edits to payouts, availability, the catalog, or
-- content tabs sat there until something else triggered a refresh. Same
-- do-block-per-table pattern as the original six above, for the same
-- reason: idempotent on re-run. package_purchase_summary is deliberately
-- excluded -- it's a view (schema.sql's own package_purchase_summary
-- comment), and postgres_changes only streams base tables; its underlying
-- patient_package_purchases is already covered.
do $$
begin
  alter publication supabase_realtime add table payment_failure_log;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table therapist_payout_batches;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table site_settings;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table therapist_availability_template;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table therapist_availability_override;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table appointment_reassignment_log;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table treatment_categories;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table treatment_category_packages;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table testimonials;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table faqs;
exception when duplicate_object then null;
end $$;

-- Brand & Contact Details (Site Content tab): the handful of strings that
-- disclose the practice's identity across the app -- Navbar brand/tagline,
-- Footer name/description/contact block/copyright -- made admin-editable
-- instead of hardcoded, on the same site_settings singleton as every other
-- Site Content / Feature Control setting. Same isolation reasoning as the
-- Session Manager columns above: a missing migration degrades to the
-- literal defaults every one of these previously hardcoded to, via
-- parseAdminSettings(), rather than breaking the nav/footer.
alter table site_settings add column if not exists site_name text not null default 'Dr. Pooja''s Physio';
alter table site_settings add column if not exists site_tagline text not null default 'Global Telehealth Platform';
alter table site_settings add column if not exists site_description text not null default 'Certified global telehealth physical therapy practice, restoring mobility from home.';
alter table site_settings add column if not exists contact_email text not null default 'hello@drpoojaphysio.com';
alter table site_settings add column if not exists whatsapp_number text not null default '+91 XXXXX XXXXX';
alter table site_settings add column if not exists contact_phone text not null default '+91 XXXXX XXXXX';
alter table site_settings add column if not exists footer_copyright_text text not null default 'Dr. Pooja''s Physio. All rights reserved.';

-- Patient Care Intake + Pain Map ---------------------------------------
--
-- Two linked but separate data layers for a patient's clinical picture:
--
-- 1. General intake (patient_condition_profiles / condition_change_requests):
--    free-form history/severity answers. Patient fills it themselves, or a
--    therapist fills it on their behalf after the patient grants access.
--    Every submission -- first fill or a later edit, from either role --
--    queues in condition_change_requests and only becomes the profile's
--    live `data` once an admin approves it. Admin's own edits apply
--    directly (no self-review). Rows in condition_change_requests are
--    never deleted, so the table doubles as the change audit log.
--
-- 2. Pain Map (pain_assessments / pain_map_question_templates): a
--    per-region clinical exam, entered by a therapist after actually
--    examining the patient. Unlike the general intake, this does NOT go
--    through admin review -- it's the therapist's own clinical judgement,
--    posted live immediately (like a clinical note), same as an admin's
--    direct edit. One row per region per assessment; rows are append-only
--    (never updated or deleted) so the UI can show a trend against the
--    previous assessment for that region -- overwriting would destroy the
--    "is this improving" comparison the whole feature exists to show.
--
-- Both layers share one write-access model: a therapist may only write to
-- a patient's condition data (general intake on their behalf, or a pain
-- map entry) after the patient's admin approves a condition_access_grants
-- request. Read access to both is automatic for the patient's assigned
-- therapist -- gating a treating therapist out of a patient's own exam
-- history would be actively harmful to care, so only WRITE is gated.
-- "Assigned" here means the therapist has ever had an appointment with
-- this patient, or holds a package's locked_therapist_id -- broader than
-- strictly "current", but read access is not the side where that
-- imprecision matters (only write is).

create table if not exists patient_condition_profiles (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null unique references profiles(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  -- Tags which version of the intake question set `data` was answered
  -- against, so a later question-wording change doesn't silently
  -- misattribute an old answer to a question it was never actually shown.
  schema_version integer not null default 1,
  status text not null default 'not_started'
    check (status in ('not_started', 'draft', 'pending_review', 'active')),
  last_submitted_by uuid references profiles(id),
  last_submitted_role text check (last_submitted_role in ('patient', 'therapist', 'admin')),
  updated_at timestamptz not null default now()
);

alter table patient_condition_profiles enable row level security;

drop policy if exists "condition_profiles_select_own" on patient_condition_profiles;
create policy "condition_profiles_select_own" on patient_condition_profiles
  for select using (auth.uid() = patient_id);

drop policy if exists "condition_profiles_select_assigned_therapist" on patient_condition_profiles;
create policy "condition_profiles_select_assigned_therapist" on patient_condition_profiles
  for select using (
    exists (
      select 1 from appointments a
      where a.patient_id = patient_condition_profiles.patient_id
        and a.therapist_id = auth.uid()
    )
    or exists (
      select 1 from patient_package_purchases pp
      where pp.patient_id = patient_condition_profiles.patient_id
        and pp.locked_therapist_id = auth.uid()
    )
  );

-- No client insert/update/delete -- the row is created and kept in sync
-- only by the admin-approve route and the therapist pain-map route, both
-- using the service role, same reasoning as profile_change_requests.
revoke insert, update, delete on patient_condition_profiles from authenticated;

create table if not exists condition_access_grants (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references profiles(id) on delete cascade,
  therapist_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'declined', 'revoked')),
  admin_notes text,
  requested_at timestamptz not null default now(),
  decided_by uuid references profiles(id),
  decided_at timestamptz
);

alter table condition_access_grants enable row level security;

drop policy if exists "condition_access_grants_select_involved" on condition_access_grants;
create policy "condition_access_grants_select_involved" on condition_access_grants
  for select using (auth.uid() = patient_id or auth.uid() = therapist_id);

-- A therapist may only request access for a patient they're actually
-- assigned to -- same "ever had an appointment, or holds the package's
-- locked_therapist_id" definition used for read access above.
drop policy if exists "condition_access_grants_insert_own" on condition_access_grants;
create policy "condition_access_grants_insert_own" on condition_access_grants
  for insert with check (
    auth.uid() = therapist_id and status = 'requested'
    and (
      exists (
        select 1 from appointments a
        where a.patient_id = condition_access_grants.patient_id
          and a.therapist_id = auth.uid()
      )
      or exists (
        select 1 from patient_package_purchases pp
        where pp.patient_id = condition_access_grants.patient_id
          and pp.locked_therapist_id = auth.uid()
      )
    )
  );

-- Approve/decline/revoke only ever happen through the admin API routes
-- using the service role -- same as profile_change_requests.
revoke update on condition_access_grants from authenticated;

-- A therapist can withdraw their own request while it's still pending.
drop policy if exists "condition_access_grants_delete_own_requested" on condition_access_grants;
create policy "condition_access_grants_delete_own_requested" on condition_access_grants
  for delete using (auth.uid() = therapist_id and status = 'requested');

create table if not exists condition_change_requests (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references profiles(id) on delete cascade,
  submitted_by uuid not null references profiles(id),
  submitted_by_role text not null check (submitted_by_role in ('patient', 'therapist', 'admin')),
  proposed_data jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  admin_notes text,
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table condition_change_requests enable row level security;

drop policy if exists "condition_change_requests_select_involved" on condition_change_requests;
create policy "condition_change_requests_select_involved" on condition_change_requests
  for select using (auth.uid() = submitted_by or auth.uid() = patient_id);

-- A patient may submit for themselves; a therapist may only submit for a
-- patient who currently has an *approved* access grant for them -- this is
-- the write gate the whole access-request flow exists to enforce.
drop policy if exists "condition_change_requests_insert_gated" on condition_change_requests;
create policy "condition_change_requests_insert_gated" on condition_change_requests
  for insert with check (
    auth.uid() = submitted_by and status = 'pending'
    and (
      (submitted_by_role = 'patient' and auth.uid() = patient_id)
      or (
        submitted_by_role = 'therapist'
        and exists (
          select 1 from condition_access_grants g
          where g.patient_id = condition_change_requests.patient_id
            and g.therapist_id = auth.uid()
            and g.status = 'approved'
        )
      )
    )
  );

-- Approve/decline (and applying an approved change to
-- patient_condition_profiles) only ever happen through the admin API
-- routes using the service role.
revoke update on condition_change_requests from authenticated;

-- Submitter can withdraw their own still-pending submission (e.g. to
-- amend before admin looks at it) -- not one already reviewed, so the
-- audit trail of what was approved/declined and why stays intact.
drop policy if exists "condition_change_requests_delete_own_pending" on condition_change_requests;
create policy "condition_change_requests_delete_own_pending" on condition_change_requests
  for delete using (auth.uid() = submitted_by and status = 'pending');

-- The admin-editable question bank behind the Pain Map's per-region forms
-- (see src/lib/painMap.ts for the region list and the seed content). Not
-- sensitive -- readable by any authenticated user so the therapist's fill
-- form and the admin's editor both render from the same source. Writes are
-- admin-only via the service role (same as site_settings).
create table if not exists pain_map_question_templates (
  id uuid primary key default gen_random_uuid(),
  region text not null,
  question_key text not null,
  question_text text not null,
  input_type text not null check (input_type in ('text', 'scale_0_10', 'yes_no', 'select')),
  display_order integer not null default 0,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now(),
  unique (region, question_key)
);

alter table pain_map_question_templates enable row level security;

drop policy if exists "pain_map_question_templates_select_all" on pain_map_question_templates;
create policy "pain_map_question_templates_select_all" on pain_map_question_templates
  for select using (true);

revoke insert, update, delete on pain_map_question_templates from authenticated;

-- One row per region per assessment -- never updated or deleted. The
-- latest row per (patient_id, region, side) is what the body map renders;
-- the one before it is what the trend arrow compares against. See the
-- section comment above for why this doesn't go through admin review the
-- way condition_change_requests does.
create table if not exists pain_assessments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references profiles(id) on delete cascade,
  region text not null,
  side text not null default 'na' check (side in ('left', 'right', 'na')),
  submitted_by uuid not null references profiles(id),
  submitted_by_role text not null check (submitted_by_role in ('therapist', 'admin')),
  -- Snapshot of the question bank as it was actually presented at submit
  -- time: [{ question_key, question_text, input_type, answer }, ...]. Never
  -- read the live template retroactively for a past answer -- an editor
  -- change to question_text must not rewrite what a historical answer was
  -- actually responding to.
  answers jsonb not null,
  pain_percent integer not null check (pain_percent between 0 and 100),
  created_at timestamptz not null default now()
);

alter table pain_assessments enable row level security;

drop policy if exists "pain_assessments_select_own" on pain_assessments;
create policy "pain_assessments_select_own" on pain_assessments
  for select using (auth.uid() = patient_id);

drop policy if exists "pain_assessments_select_assigned_therapist" on pain_assessments;
create policy "pain_assessments_select_assigned_therapist" on pain_assessments
  for select using (
    exists (
      select 1 from appointments a
      where a.patient_id = pain_assessments.patient_id
        and a.therapist_id = auth.uid()
    )
    or exists (
      select 1 from patient_package_purchases pp
      where pp.patient_id = pain_assessments.patient_id
        and pp.locked_therapist_id = auth.uid()
    )
  );

-- A therapist may only post an assessment for a patient who has approved
-- their access grant -- the same write gate as condition_change_requests,
-- shared across both data layers rather than duplicated as a second
-- approval flow.
drop policy if exists "pain_assessments_insert_gated" on pain_assessments;
create policy "pain_assessments_insert_gated" on pain_assessments
  for insert with check (
    auth.uid() = submitted_by and submitted_by_role = 'therapist'
    and exists (
      select 1 from condition_access_grants g
      where g.patient_id = pain_assessments.patient_id
        and g.therapist_id = auth.uid()
        and g.status = 'approved'
    )
  );

-- Append-only audit trail -- no correction path except posting a new row.
revoke update, delete on pain_assessments from authenticated;

do $$
begin
  alter publication supabase_realtime add table patient_condition_profiles;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table condition_access_grants;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table condition_change_requests;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table pain_assessments;
exception when duplicate_object then null;
end $$;

-- Onboarding tour + intake draft autosave --------------------------------
--
-- onboarding_seen_at: set once a patient dismisses (or acts on) the
-- first-login welcome modal on their dashboard. Skippable by design (see
-- the product decision in the Patient Care Intake planning thread) --
-- this only silences the one-time welcome modal, not the persistent
-- "complete your health profile" reminder banner, which instead reads
-- patient_condition_profiles.status directly.
alter table profiles add column if not exists onboarding_seen_at timestamptz;

-- draft_data: a scratch buffer for an in-progress Patient Care Intake
-- fill, autosaved as the patient or therapist types, completely separate
-- from `data` (which only ever holds the latest *approved* snapshot).
-- Never touched by the review flow -- only the save-draft routes write it,
-- and it's cleared once a real submission is made so a stale draft can't
-- resurface after the thing it was drafting has already been decided.
alter table patient_condition_profiles add column if not exists draft_data jsonb;

-- Admin-editable Patient Care Intake question bank (mirrors
-- pain_map_question_templates -- see that table's comment). A row's mere
-- existence is an override: both question_text and required are always
-- saved together per question (one admin editor row = one save), so
-- there's no separate "override just the wording" vs "override just
-- required" state to reconcile. No row = use the code default in
-- src/lib/conditionIntake.ts. Not region-scoped like the Pain Map table --
-- intake questions are a single global list -- so question_key alone is
-- the unique key.
create table if not exists intake_question_templates (
  id uuid primary key default gen_random_uuid(),
  question_key text not null unique,
  question_text text not null,
  required boolean not null,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

alter table intake_question_templates enable row level security;

drop policy if exists "intake_question_templates_select_all" on intake_question_templates;
create policy "intake_question_templates_select_all" on intake_question_templates
  for select using (true);

revoke insert, update, delete on intake_question_templates from authenticated;
do $$
begin
  alter publication supabase_realtime add table intake_question_templates;
exception when duplicate_object then null;
end $$;

-- Race-closing constraints -------------------------------------------------
--
-- Both "one pending submission per patient" and "one open access request
-- per (patient, therapist)" were previously enforced only by an
-- application-level select-count-then-insert, which has a real race
-- window: two near-simultaneous requests can both pass the count check
-- before either insert lands. These partial unique indexes make the
-- invariant a DB-level guarantee instead -- the routes still do the
-- select-count check first as a fast, friendly-error path, but the insert
-- itself is now the real guard (see the 23505-catch in each route).
create unique index if not exists condition_change_requests_one_pending
  on condition_change_requests (patient_id)
  where status = 'pending';

create unique index if not exists condition_access_grants_one_open
  on condition_access_grants (patient_id, therapist_id)
  where status in ('requested', 'approved');

-- ============================================================================
-- Home Visit ----------------------------------------------------------------
--
-- A second delivery mode: the therapist travels to the patient's home
-- instead of meeting them on a video call. Deliberately built on the
-- existing `appointments` table rather than a parallel session table --
-- payouts, earnings, ratings, refunds, the Pain Map/intake access rules,
-- the calendar and the admin session views all key off `appointments`, and
-- forking that would mean maintaining two of each forever. One column
-- (`visit_mode`) decides which kind a row is; everything else about an
-- appointment behaves identically.
--
-- The four things a home visit has that an online session does not:
--   1. an address (plus a map pin) instead of a Meet link
--   2. a travel fee on top of the package price
--   3. the option of cash collected at the door, not only prepaid
--   4. an HV#### display code instead of SS####
-- ============================================================================

-- Where we are willing to send a therapist, and what the trip costs.
-- Admin-managed rather than computed from a distance API: the catchment
-- is a business decision (which therapists live where, which areas are
-- worth the drive), not a radius. Publicly readable because the booking
-- wizard has to answer "do you serve my pincode?" before a guest has an
-- account, let alone a payment.
--
-- pincode is the unique key, not (city, area_name): a pincode is what the
-- patient actually types and what the map pin resolves to, and it's the
-- only one of the three that's unambiguous.
create table if not exists home_visit_areas (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  area_name text,
  pincode text not null unique,
  travel_fee_paise integer not null default 0 check (travel_fee_paise >= 0),
  notes text,
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table home_visit_areas enable row level security;

drop policy if exists "home_visit_areas_select_active" on home_visit_areas;
create policy "home_visit_areas_select_active" on home_visit_areas
  for select using (active = true);

drop policy if exists "home_visit_areas_select_admin" on home_visit_areas;
create policy "home_visit_areas_select_admin" on home_visit_areas
  for select using (is_admin());

grant select on home_visit_areas to anon, authenticated;

-- No client writes -- the admin Service Areas tab owns this table through
-- service-role routes, same as treatment_categories.
revoke insert, update, delete on home_visit_areas from authenticated;

create index if not exists home_visit_areas_active_idx on home_visit_areas (active);

-- The patient's saved address book. Separate from the address snapshot on
-- each appointment (below) on purpose: this is the editable, reusable
-- source of truth ("my flat", "mum's place"), while the appointment keeps
-- a frozen copy of wherever a given visit was actually delivered. Editing
-- an address here must never silently rewrite the address a completed
-- visit was carried out at -- the same reasoning as amount_paid_paise and
-- duration_minutes being snapshotted onto appointments.
--
-- latitude/longitude come from the Google Maps pin. They are the ground
-- truth the therapist navigates to: Indian street addresses are frequently
-- approximate, and a dropped pin is often the only thing that finds the
-- right gate. Nullable, because the map is a progressive enhancement --
-- if the Maps script fails to load the form falls back to typed fields and
-- the booking still has to work.
--
-- access_notes is not a nice-to-have. Floor, lift, gate code, which bell,
-- "dog in the yard" -- this is what actually gets the therapist through
-- the door, and support calls are the alternative.
create table if not exists patient_addresses (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references profiles(id) on delete cascade,
  label text,
  line1 text not null,
  line2 text,
  landmark text,
  city text,
  state text,
  pincode text not null,
  area_id uuid references home_visit_areas(id),
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  map_place_id text,
  contact_phone text,
  access_notes text,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table patient_addresses enable row level security;

drop policy if exists "patient_addresses_select_own" on patient_addresses;
create policy "patient_addresses_select_own" on patient_addresses
  for select using (auth.uid() = patient_id);

drop policy if exists "patient_addresses_select_admin" on patient_addresses;
create policy "patient_addresses_select_admin" on patient_addresses
  for select using (is_admin());

-- An assigned therapist can read the address book of a patient they
-- actually work with -- exactly the same "ever had an appointment with
-- them, or holds a package's locked therapist slot" test used by
-- condition_profiles_select_assigned_therapist, extended with the
-- home-visit purchase table. Note this is READ only, and only for
-- therapists already attached to the patient: a therapist with no
-- relationship to a patient can never see where they live.
drop policy if exists "patient_addresses_select_assigned_therapist" on patient_addresses;
create policy "patient_addresses_select_assigned_therapist" on patient_addresses
  for select using (
    exists (
      select 1 from appointments a
      where a.patient_id = patient_addresses.patient_id
        and a.therapist_id = auth.uid()
    )
    or exists (
      select 1 from patient_package_purchases pp
      where pp.patient_id = patient_addresses.patient_id
        and pp.locked_therapist_id = auth.uid()
    )
  );

-- Unlike most patient-owned data in this schema, addresses ARE
-- client-writable. They deliberately do not go through
-- profile_change_requests: a patient who mistyped their flat number has to
-- be able to fix it before the therapist sets off, and an admin approval
-- queue between them and that fix would be actively harmful. The insert
-- check pins patient_id so nobody can file an address against someone
-- else's account.
drop policy if exists "patient_addresses_insert_own" on patient_addresses;
create policy "patient_addresses_insert_own" on patient_addresses
  for insert with check (
    auth.uid() = patient_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and approved = true and active = true
    )
  );

drop policy if exists "patient_addresses_update_own" on patient_addresses;
create policy "patient_addresses_update_own" on patient_addresses
  for update using (auth.uid() = patient_id) with check (auth.uid() = patient_id);

-- Soft-delete only (active = false), so an address referenced by a past
-- visit's visit_address_id never disappears out from under it.
revoke delete on patient_addresses from authenticated;

create index if not exists patient_addresses_patient_id_idx on patient_addresses (patient_id);
create index if not exists patient_addresses_pincode_idx on patient_addresses (pincode);

-- At most one default address per patient. Enforced here rather than in
-- the set-default route alone, for the same reason as the
-- condition_change_requests one-pending index: a select-then-update pair
-- has a real race window, a partial unique index does not.
create unique index if not exists patient_addresses_one_default
  on patient_addresses (patient_id)
  where is_default = true and active = true;

-- The home-visit catalogue. A separate table from
-- treatment_category_packages rather than a mode flag on it: the two
-- share almost no fields (travel, visit duration, per-week caps vs
-- category linkage and dashboard visibility rules), and every existing
-- online package screen, purchase route and therapist-lock rule would
-- otherwise have to become mode-aware -- with a leak of a home-visit
-- package into the online booking wizard as the failure mode.
--
-- visit_count >= 1, deliberately not >= 2 like the online packages: a
-- single one-off home visit is simply a one-visit package. That keeps the
-- product catalogue at three sellable things (online single, online
-- package, home-visit package) instead of four, and means the booking,
-- scheduling and refund paths have exactly one shape to handle.
create table if not exists home_visit_packages (
  id uuid primary key default gen_random_uuid(),
  package_code text,
  title text not null,
  subtitle text,
  description text,
  image_url text,
  benefits jsonb not null default '[]'::jsonb,
  visit_count integer not null check (visit_count >= 1),
  price_paise integer not null check (price_paise > 0),
  compare_at_paise integer,
  visit_duration_minutes integer not null default 60 check (visit_duration_minutes > 0),
  validity_days integer check (validity_days is null or validity_days > 0),
  -- When true the advertised price already covers travel and no per-area
  -- fee is added at checkout. Lets admin run "all inclusive" packages
  -- without having to zero out every service area's fee.
  travel_fee_included boolean not null default false,
  therapist_locked boolean not null default true,
  min_gap_hours integer,
  max_visits_per_week integer,
  max_purchases_per_patient integer,
  badge_label text,
  highlight boolean not null default false,
  terms text,
  -- Optional clinical grouping so a home-visit package can be surfaced
  -- next to the matching condition. Nullable: most home-visit packages
  -- are sold on the visit itself, not on a condition category.
  category_id uuid references treatment_categories(id),
  display_order integer not null default 0,
  active boolean not null default true,
  visible_on_home boolean not null default false,
  visible_on_home_visit_page boolean not null default true,
  visible_in_dashboard boolean not null default true,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'home_visit_packages_compare_at_range'
  ) then
    alter table home_visit_packages add constraint home_visit_packages_compare_at_range
      check (compare_at_paise is null or compare_at_paise >= price_paise);
  end if;
end $$;

alter table home_visit_packages enable row level security;

drop policy if exists "home_visit_packages_select_active" on home_visit_packages;
create policy "home_visit_packages_select_active" on home_visit_packages
  for select using (active = true);

drop policy if exists "home_visit_packages_select_admin" on home_visit_packages;
create policy "home_visit_packages_select_admin" on home_visit_packages
  for select using (is_admin());

grant select on home_visit_packages to anon, authenticated;
revoke insert, update, delete on home_visit_packages from authenticated;

-- What a patient actually bought. Mirrors patient_package_purchases,
-- including its counter semantics: visits_used counts visits CLAIMED
-- (scheduled or completed), never visits completed. A scheduled visit has
-- already consumed its slot in the programme; only a cancellation gives it
-- back. See the counter-semantics comment on patient_package_purchases.
--
-- payment_mode is the one genuinely new axis. 'prepaid' behaves exactly
-- like an online package purchase (Razorpay before anything is booked).
-- 'cash_on_visit' books first and collects at the door, which means the
-- row legitimately sits at payment_status 'unpaid' with real, confirmed
-- visits hanging off it -- something no online purchase ever does.
create table if not exists home_visit_package_purchases (
  id uuid primary key default gen_random_uuid(),
  purchase_code text,
  patient_id uuid not null references profiles(id) on delete cascade,
  package_id uuid not null references home_visit_packages(id),
  visit_count integer not null,
  visits_used integer not null default 0,
  amount_paid_paise integer,
  travel_fee_paise integer not null default 0,
  payment_mode text not null default 'prepaid' check (payment_mode in ('prepaid', 'cash_on_visit')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'failed')),
  razorpay_order_id text,
  razorpay_payment_id text,
  paid_at timestamptz,
  expires_at timestamptz,
  status text not null default 'active'
    check (status in ('active', 'completed', 'expired', 'refunded', 'cancelled')),
  locked_therapist_id uuid references profiles(id) on delete set null,
  default_address_id uuid references patient_addresses(id),
  notes text,
  expiry_extended_at timestamptz,
  expiry_extended_by uuid references profiles(id),
  expiry_extension_reason text,
  refund_amount_paise integer,
  refunded_at timestamptz,
  refund_id text,
  created_at timestamptz not null default now()
);

alter table home_visit_package_purchases enable row level security;

drop policy if exists "home_visit_purchases_select_own" on home_visit_package_purchases;
create policy "home_visit_purchases_select_own" on home_visit_package_purchases
  for select using (auth.uid() = patient_id);

drop policy if exists "home_visit_purchases_select_admin" on home_visit_package_purchases;
create policy "home_visit_purchases_select_admin" on home_visit_package_purchases
  for select using (is_admin());

drop policy if exists "home_visit_purchases_select_locked_therapist" on home_visit_package_purchases;
create policy "home_visit_purchases_select_locked_therapist" on home_visit_package_purchases
  for select using (auth.uid() = locked_therapist_id);

-- No client insert or update policy at all, same as
-- patient_package_purchases: a purchase is only ever created by the
-- service-role booking routes, which are also the only place the price,
-- the travel fee and the serviceability check can be trusted.
revoke insert, update, delete on home_visit_package_purchases from authenticated;

create index if not exists home_visit_purchases_patient_id_idx on home_visit_package_purchases (patient_id);
create index if not exists home_visit_purchases_locked_therapist_idx on home_visit_package_purchases (locked_therapist_id);
create index if not exists home_visit_purchases_status_idx on home_visit_package_purchases (status);
create index if not exists home_visit_purchases_expires_at_idx on home_visit_package_purchases (expires_at);

-- --------------------------------------------------------------------------
-- appointments: the home-visit columns
-- --------------------------------------------------------------------------

-- The one column that decides what kind of session a row is. Defaults to
-- 'online' so every existing appointment keeps its current meaning without
-- a data migration.
alter table appointments add column if not exists visit_mode text
  not null default 'online'
  check (visit_mode in ('online', 'home_visit'));

-- Which saved address this visit was booked from. Kept alongside the
-- snapshot columns below rather than instead of them: this points at the
-- live, editable row (useful for "book again at the same place"), while
-- the snapshot records where the visit was actually delivered even after
-- the patient edits or retires that address.
alter table appointments add column if not exists visit_address_id uuid references patient_addresses(id);

alter table appointments add column if not exists visit_label text;
alter table appointments add column if not exists visit_address_line1 text;
alter table appointments add column if not exists visit_address_line2 text;
alter table appointments add column if not exists visit_landmark text;
alter table appointments add column if not exists visit_city text;
alter table appointments add column if not exists visit_state text;
alter table appointments add column if not exists visit_pincode text;
alter table appointments add column if not exists visit_latitude numeric(10, 7);
alter table appointments add column if not exists visit_longitude numeric(10, 7);
alter table appointments add column if not exists visit_map_place_id text;
alter table appointments add column if not exists visit_contact_phone text;
alter table appointments add column if not exists visit_access_notes text;
alter table appointments add column if not exists visit_area_id uuid references home_visit_areas(id);

-- Charged on top of the package price and paid through to the therapist in
-- full -- it is a reimbursement for the trip, not revenue. Kept in its own
-- column (rather than folded into amount_paid_paise) precisely so the
-- revenue-share math can exclude it; fold it in and the therapist ends up
-- funding their own transport out of their own cut.
alter table appointments add column if not exists travel_fee_paise integer;

alter table appointments add column if not exists home_visit_purchase_id uuid references home_visit_package_purchases(id);

-- Visit progress the patient can watch. Optional -- a therapist who never
-- taps them costs nothing, the visit still completes normally.
alter table appointments add column if not exists therapist_en_route_at timestamptz;
alter table appointments add column if not exists therapist_arrived_at timestamptz;

-- Cash collected at the door. cash_collected_* is the therapist's own
-- assertion that they took the money; cash_remitted_at is the admin
-- confirming it reached the business. Both are needed: between the two the
-- therapist is holding company money, and that gap is exactly what the
-- admin Cash Ledger and the payout net-off are built to surface.
alter table appointments add column if not exists cash_collected_at timestamptz;
alter table appointments add column if not exists cash_collected_amount_paise integer;
alter table appointments add column if not exists cash_collected_by uuid references profiles(id);
alter table appointments add column if not exists cash_remitted_at timestamptz;

create index if not exists appointments_visit_mode_idx on appointments (visit_mode);
create index if not exists appointments_home_visit_purchase_idx on appointments (home_visit_purchase_id);

-- Note: refund_status' 'manual_pending' value (what a cancelled
-- cash-on-visit booking gets, since there is no Razorpay payment to
-- reverse) is declared with the rest of that constraint's value list
-- further up this file, not here -- see the comment there for why widening
-- it from this end cannot work.

-- Audit trail for a home-visit programme, mirroring
-- package_purchase_events. Separate table rather than a shared one because
-- purchase_id has to be a real foreign key to exactly one purchases table.
create table if not exists home_visit_purchase_events (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references home_visit_package_purchases(id) on delete cascade,
  event_type text not null check (event_type in (
    'purchased', 'visit_scheduled', 'visit_cancelled', 'visit_completed',
    'visit_restored', 'therapist_locked', 'therapist_reassigned',
    'address_changed', 'cash_collected', 'cash_remitted',
    'expiry_extended', 'refunded', 'expired'
  )),
  actor_id uuid references profiles(id),
  appointment_id uuid references appointments(id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table home_visit_purchase_events enable row level security;

drop policy if exists "home_visit_events_select_own" on home_visit_purchase_events;
create policy "home_visit_events_select_own" on home_visit_purchase_events
  for select using (
    exists (
      select 1 from home_visit_package_purchases hp
      where hp.id = home_visit_purchase_events.purchase_id and hp.patient_id = auth.uid()
    )
  );

drop policy if exists "home_visit_events_select_admin" on home_visit_purchase_events;
create policy "home_visit_events_select_admin" on home_visit_purchase_events
  for select using (is_admin());

drop policy if exists "home_visit_events_select_locked_therapist" on home_visit_purchase_events;
create policy "home_visit_events_select_locked_therapist" on home_visit_purchase_events
  for select using (
    exists (
      select 1 from home_visit_package_purchases hp
      where hp.id = home_visit_purchase_events.purchase_id
        and hp.locked_therapist_id = auth.uid()
    )
  );

revoke insert, update, delete on home_visit_purchase_events from authenticated;

create index if not exists home_visit_purchase_events_purchase_id_idx
  on home_visit_purchase_events (purchase_id);

-- Demand we had to turn away. Someone who tried to book from an
-- unserviceable pincode is the single best signal for which area to open
-- next, and throwing that away because the booking failed would be a
-- waste. Anonymous INSERT (the wizard rejects them before they ever have
-- an account) with admin-only read -- exactly the b2b_leads pattern.
create table if not exists home_visit_waitlist (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text not null,
  email text,
  pincode text not null,
  city text,
  note text,
  status text not null default 'new' check (status in ('new', 'contacted', 'served', 'declined')),
  created_at timestamptz not null default now()
);

alter table home_visit_waitlist enable row level security;

drop policy if exists "home_visit_waitlist_insert_public" on home_visit_waitlist;
create policy "home_visit_waitlist_insert_public" on home_visit_waitlist
  for insert with check (true);

drop policy if exists "home_visit_waitlist_select_admin" on home_visit_waitlist;
create policy "home_visit_waitlist_select_admin" on home_visit_waitlist
  for select using (is_admin());

grant insert on home_visit_waitlist to anon, authenticated;
revoke update, delete on home_visit_waitlist from authenticated;

-- --------------------------------------------------------------------------
-- Home Visit display codes: HV#### sessions, HP#### packages, HS#### sales
-- --------------------------------------------------------------------------

create sequence if not exists home_visit_code_seq;
create sequence if not exists home_visit_package_code_seq;
create sequence if not exists home_visit_purchase_code_seq;

-- Home visits get their own SS-parallel series so a visit can be quoted
-- over the phone without ambiguity about which kind of session it is.
-- Replaces the original assign_session_code() (defined earlier in this
-- file) rather than adding a second trigger: two BEFORE INSERT triggers
-- both trying to own session_code would be order-dependent and impossible
-- to reason about. Behaviour for online sessions is byte-identical to the
-- version above.
create or replace function assign_session_code() returns trigger as $$
begin
  if new.session_code is null then
    if new.visit_mode = 'home_visit' then
      new.session_code := 'HV' || lpad(nextval('home_visit_code_seq')::text, 4, '0');
    else
      new.session_code := 'SS' || lpad(nextval('session_code_seq')::text, 4, '0');
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

-- The session_code backfill earlier in this file derives its setval from
-- max(substring(session_code from 3)::int) across ALL appointments, which
-- predates HV codes existing and would therefore fold HV numbers into the
-- SS counter on a re-run (harmless for uniqueness -- the prefixes differ --
-- but it would make the SS series skip numbers for no reason). Rather than
-- rewriting that earlier block, which this file's append-only convention
-- forbids, correct both counters here: the file runs top to bottom, so
-- these are the values that actually stick.
--
-- setval() is called through the two-argument form below rather than
-- setval(seq, n, true) with n possibly 0: a fresh sequence has
-- MINVALUE 1, so setval(seq, 0, true) raises "value 0 is out of bounds"
-- and aborts the whole script on a database that has no rows of that kind
-- yet. setval(seq, 1, false) is the correct way to say "the next nextval
-- should return 1".
do $$
declare
  max_ss integer;
  max_hv integer;
begin
  select coalesce(max(substring(session_code from 3)::int), 0) into max_ss
    from appointments where session_code like 'SS%';
  select coalesce(max(substring(session_code from 3)::int), 0) into max_hv
    from appointments where session_code like 'HV%';

  perform setval('session_code_seq', greatest(max_ss, 1), max_ss > 0);
  perform setval('home_visit_code_seq', greatest(max_hv, 1), max_hv > 0);
end $$;

create or replace function assign_home_visit_package_code() returns trigger as $$
begin
  if new.package_code is null then
    new.package_code := 'HP' || lpad(nextval('home_visit_package_code_seq')::text, 4, '0');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_assign_home_visit_package_code on home_visit_packages;
create trigger trg_assign_home_visit_package_code
  before insert on home_visit_packages
  for each row execute function assign_home_visit_package_code();

create or replace function assign_home_visit_purchase_code() returns trigger as $$
begin
  if new.purchase_code is null then
    new.purchase_code := 'HS' || lpad(nextval('home_visit_purchase_code_seq')::text, 4, '0');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_assign_home_visit_purchase_code on home_visit_package_purchases;
create trigger trg_assign_home_visit_purchase_code
  before insert on home_visit_package_purchases
  for each row execute function assign_home_visit_purchase_code();

-- Same idempotent, max()-derived, deletion-safe backfill pattern as every
-- other code series in this file -- never count(*), which silently
-- regresses the sequence the moment any row is deleted.
do $$
declare
  max_hp integer;
  max_hs integer;
begin
  select coalesce(max(substring(package_code from 3)::int), 0) into max_hp
    from home_visit_packages;
  if exists (select 1 from home_visit_packages where package_code is null) then
    with ordered as (
      select id, row_number() over (order by created_at asc, id asc) as rn
      from home_visit_packages where package_code is null
    )
    update home_visit_packages p
      set package_code = 'HP' || lpad((max_hp + ordered.rn)::text, 4, '0')
    from ordered where p.id = ordered.id;
    select coalesce(max(substring(package_code from 3)::int), 0) into max_hp
      from home_visit_packages;
  end if;
  perform setval('home_visit_package_code_seq', greatest(max_hp, 1), max_hp > 0);

  select coalesce(max(substring(purchase_code from 3)::int), 0) into max_hs
    from home_visit_package_purchases;
  if exists (select 1 from home_visit_package_purchases where purchase_code is null) then
    with ordered as (
      select id, row_number() over (order by created_at asc, id asc) as rn
      from home_visit_package_purchases where purchase_code is null
    )
    update home_visit_package_purchases p
      set purchase_code = 'HS' || lpad((max_hs + ordered.rn)::text, 4, '0')
    from ordered where p.id = ordered.id;
    select coalesce(max(substring(purchase_code from 3)::int), 0) into max_hs
      from home_visit_package_purchases;
  end if;
  perform setval('home_visit_purchase_code_seq', greatest(max_hs, 1), max_hs > 0);
end $$;

create unique index if not exists home_visit_packages_code_unique_idx
  on home_visit_packages (package_code) where package_code is not null;
create unique index if not exists home_visit_purchases_code_unique_idx
  on home_visit_package_purchases (purchase_code) where purchase_code is not null;

-- --------------------------------------------------------------------------
-- Home visits are never inserted by the browser
-- --------------------------------------------------------------------------
--
-- Re-declares appointments_insert_own with one added clause:
-- visit_mode = 'online'. The client-side booking wizard's direct insert
-- (the one path where RLS is the only enforcement point) stays exactly as
-- restricted as it is today, and every home-visit insert goes through a
-- service-role route instead -- the same shape bookPackageSession already
-- uses.
--
-- That is not defensive tidiness. A home visit's price is the package
-- price PLUS a travel fee resolved from the pincode's service area, and
-- whether that pincode is serviceable at all is itself a server-side
-- lookup. None of that can be re-derived from a client insert the way
-- duration_minutes can be pinned to the category below, so the only
-- honest options were to widen this policy with logic it cannot express,
-- or to keep the browser out of the home-visit path entirely.
--
-- Everything else in this policy is carried over verbatim from the version
-- earlier in this file; see the long comment there for why each clause
-- exists (each closed a real hole).
drop policy if exists "appointments_insert_own" on appointments;
create policy "appointments_insert_own" on appointments
  for insert with check (
    auth.uid() = patient_id
    and visit_mode = 'online'
    and status = 'requested'
    and payment_status = 'unpaid'
    and package_purchase_id is null
    and home_visit_purchase_id is null
    and slot_time is not null
    and slot_time > now()
    and therapist_id is null
    and duration_minutes = coalesce(
      (select duration_minutes from treatment_categories where id = category_id),
      60
    )
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and approved = true and active = true
    )
  );

-- --------------------------------------------------------------------------
-- Home Visit settings + per-mode revenue share
-- --------------------------------------------------------------------------

-- Master switch. Defaults to false so merging this schema onto a live
-- database changes nothing visible until an admin has actually configured
-- service areas and a catalogue.
alter table site_settings add column if not exists home_visit_enabled boolean not null default false;
alter table site_settings add column if not exists home_visit_cash_enabled boolean not null default true;

-- Longer than the online BOOKING_LEAD_TIME_HOURS of 12: a home visit has
-- to be routed to a therapist who can physically get there, which is not
-- something to arrange overnight.
alter table site_settings add column if not exists home_visit_lead_time_hours integer not null default 24;
alter table site_settings add column if not exists home_visit_cancellation_refund_hours integer not null default 24;
alter table site_settings add column if not exists home_visit_default_validity_days integer not null default 90;
alter table site_settings add column if not exists home_visit_bulk_schedule_max integer not null default 8;

-- Padding added on both sides of a home visit when checking a therapist's
-- calendar for conflicts. Purely time-based travel allowance -- the app has
-- no distance data -- but it stops the obvious failure of two visits
-- booked back to back on opposite sides of a city.
alter table site_settings add column if not exists home_visit_travel_buffer_minutes integer not null default 45;

alter table site_settings add column if not exists home_visit_page_heading text;
alter table site_settings add column if not exists home_visit_page_subheading text;

-- profiles.revenue_share_percent is a single scalar per person with no
-- per-mode dimension, and a home visit costs the therapist travel time an
-- online session does not -- so the same percentage is rarely the right
-- answer for both. Nullable on purpose: unset means "no separate
-- home-visit rate, use revenue_share_percent", so nothing changes for
-- therapists the admin hasn't given a distinct rate to.
alter table profiles add column if not exists home_visit_revenue_share_percent numeric(5,2);
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_home_visit_share_range'
  ) then
    alter table profiles add constraint profiles_home_visit_share_range
      check (home_visit_revenue_share_percent is null
             or (home_visit_revenue_share_percent >= 0 and home_visit_revenue_share_percent <= 100));
  end if;
end $$;

-- Live refresh for every dashboard that renders home-visit data, matching
-- how the online package tables are published.
do $$
begin
  alter publication supabase_realtime add table home_visit_areas;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table patient_addresses;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table home_visit_packages;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table home_visit_package_purchases;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table home_visit_purchase_events;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table home_visit_waitlist;
exception when duplicate_object then null;
end $$;

-- Failed home-visit checkouts. payment_failure_log already links a failure
-- to an appointment or an online package purchase; a home-visit purchase is
-- the third thing a patient can be paying for, and without this column its
-- failures would be logged with no link to what was being bought -- leaving
-- the admin's Payment History unable to say which home visit was abandoned.
alter table payment_failure_log
  add column if not exists home_visit_purchase_id uuid references home_visit_package_purchases(id);

-- payment_failure_log_target_check originally read "exactly one of
-- appointment_id or package_purchase_id", which rejects every home-visit
-- failure outright. Widened to three targets, still exactly one of them.
--
-- Safe to do from down here, unlike the refund_status list further up: that
-- constraint is a standalone `alter table ... add constraint` that re-runs
-- and re-narrows on every apply, whereas this one is declared inline in a
-- `create table if not exists`, so it is only ever created once and a
-- re-run leaves this widened version in place.
alter table payment_failure_log drop constraint if exists payment_failure_log_target_check;
alter table payment_failure_log add constraint payment_failure_log_target_check check (
  (appointment_id is not null)::int
  + (package_purchase_id is not null)::int
  + (home_visit_purchase_id is not null)::int
  = 1
);

-- --------------------------------------------------------------------------
-- patient_referrals: home-visit wiring
-- --------------------------------------------------------------------------
-- A hospital referral is the one other place a patient's first session gets
-- created outside the self-service booking wizards (see
-- register-via-referral), so it needs the same visit_mode axis. `address`
-- already existed but nothing ever read it back after conversion -- pincode
-- is what actually drives serviceability + travel fee, so it gets its own
-- column rather than being parsed out of the free-text address.
alter table patient_referrals
  add column if not exists visit_mode text not null default 'online'
    check (visit_mode in ('online', 'home_visit'));
alter table patient_referrals add column if not exists pincode text;

-- --------------------------------------------------------------------------
-- appointments_insert_own: drop the approved requirement for online booking
-- --------------------------------------------------------------------------
-- Re-declares appointments_insert_own once more, this time dropping
-- `approved = true` and keeping only `active = true` -- the same judgement
-- /api/home-visit/create-order's isProfileActive (not
-- isProfileActiveAndApproved) already applies, extended to the one path
-- that still went through the stricter check: a self-signup patient booking
-- and paying for a single online session in the same visit they discovered
-- the site. Requiring approval here meant they signed up, hit a wall, and
-- in practice never came back -- while the row this policy actually lets
-- through is always unpaid + requested + unassigned, so it does nothing on
-- its own. /api/razorpay/verify flips the patient's `approved` to true the
-- moment their payment on it is confirmed (mirroring
-- register-via-referral's approved = true), so the admin approval gate is
-- satisfied by a completed payment instead of a human -- same precedent as
-- home visits, just applied after checkout instead of before it since this
-- flow's insert has to happen ahead of payment to get an appointment id for
-- Razorpay.
--
-- Everything else here is carried over verbatim from the version earlier in
-- this file; see the long comment there for why each remaining clause
-- exists (each closed a real hole).
drop policy if exists "appointments_insert_own" on appointments;
create policy "appointments_insert_own" on appointments
  for insert with check (
    auth.uid() = patient_id
    and visit_mode = 'online'
    and status = 'requested'
    and payment_status = 'unpaid'
    and package_purchase_id is null
    and home_visit_purchase_id is null
    and slot_time is not null
    and slot_time > now()
    and therapist_id is null
    and duration_minutes = coalesce(
      (select duration_minutes from treatment_categories where id = category_id),
      60
    )
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and active = true
    )
  );

-- ==========================================================================
-- Admin back office: scopes, activity log, and online booking rules
-- ==========================================================================
-- Three gaps this closes, all of them "the admin cannot actually control
-- this from the dashboard":
--   1. admin was all-or-nothing, and the only way to make one was editing
--      this database by hand -- so an ops assistant who needed to see
--      bookings also got the ability to settle payouts;
--   2. nothing recorded which admin issued a refund, settled a payout or
--      approved an account;
--   3. the online booking lead time and cancellation refund window were
--      constants in the code (bookingSlots.ts / pricing.ts) while their
--      home-visit equivalents were already admin settings -- the same
--      decision at two different levels of control.

-- --------------------------------------------------------------------------
-- profiles.admin_scope
-- --------------------------------------------------------------------------
-- Only meaningful on role = 'admin'. Deliberately defaulted to 'full' so
-- applying this file can never lock an existing admin out of their own
-- dashboard -- see parseAdminScope in src/lib/adminScope.ts, which reads any
-- unknown/null value the same way for the same reason.
alter table profiles add column if not exists admin_scope text not null default 'full';
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_admin_scope_check'
  ) then
    alter table profiles add constraint profiles_admin_scope_check
      check (admin_scope in ('full', 'operations', 'finance', 'clinical'));
  end if;
end $$;

-- --------------------------------------------------------------------------
-- admin_activity_log
-- --------------------------------------------------------------------------
-- Append-only record of what an admin did. Written by
-- recordAdminActivity() (src/lib/adminActivityLog.ts) through the service
-- role client, best-effort: a failed audit write is logged server-side and
-- never blocks the action it describes.
--
-- amount_paise is its own column rather than a key inside `details` so the
-- Activity Log screen can filter to "everything that moved money" without
-- parsing json. target_label snapshots the human-readable subject at write
-- time, so an entry stays readable after the row it points at is renamed or
-- deleted.
create table if not exists admin_activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references profiles(id),
  action text not null,
  target_id uuid,
  target_label text,
  amount_paise integer,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_activity_log_created_at_idx
  on admin_activity_log (created_at desc);
create index if not exists admin_activity_log_actor_idx
  on admin_activity_log (actor_id, created_at desc);

alter table admin_activity_log enable row level security;

-- Admins read; nobody writes, updates or deletes through the API at all.
-- Inserts happen exclusively through the service-role client, which bypasses
-- RLS -- so the absence of an insert policy here is the thing that makes
-- this log append-only from any authenticated session, including an admin's.
drop policy if exists "admin_activity_log_select_admin" on admin_activity_log;
create policy "admin_activity_log_select_admin" on admin_activity_log
  for select using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

do $$
begin
  alter publication supabase_realtime add table admin_activity_log;
exception when duplicate_object then null;
end $$;

-- --------------------------------------------------------------------------
-- site_settings: online booking rules
-- --------------------------------------------------------------------------
-- The defaults match the constants these replace exactly
-- (BOOKING_LEAD_TIME_HOURS = 12, CANCELLATION_FULL_REFUND_HOURS = 24), so
-- applying this file changes no behaviour until an admin edits them.
alter table site_settings add column if not exists online_booking_lead_time_hours integer not null default 12
  check (online_booking_lead_time_hours >= 0);
alter table site_settings add column if not exists online_cancellation_refund_hours integer not null default 24
  check (online_cancellation_refund_hours >= 0);

-- --------------------------------------------------------------------------
-- appointments: partial / discretionary refunds
-- --------------------------------------------------------------------------
-- The automatic rule is unchanged: full refund outside the window, none
-- inside it. This adds the case that rule can't express -- an admin
-- deciding, per case, to return part of what was paid. refund_amount_paise
-- already records how much went back; these two record that a human chose
-- it and why, which is exactly what the automatic path does not need and a
-- discretionary one must have.
alter table appointments add column if not exists refund_is_manual boolean not null default false;
alter table appointments add column if not exists refund_reason text;

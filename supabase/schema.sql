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
  -- still start unapproved/gated appropriately below. Admin accounts are
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
    (v_role = 'patient'),
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
-- full_name and credentials are deliberately NOT in this list even though
-- they were originally — both are identity/trust-sensitive (credentials
-- especially, since patients see it as a therapist's license claim), so
-- changing either now goes through profile_change_requests + admin
-- approval instead of being directly writable. Everything else here is
-- low-risk enough to save immediately.
revoke update on profiles from authenticated;
grant update (
  phone, timezone, avatar_url,
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
  old_category_id uuid references treatment_categories(id),
  new_category_id uuid references treatment_categories(id)
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
alter table appointments drop constraint if exists appointments_refund_status_check;
alter table appointments add constraint appointments_refund_status_check
  check (refund_status is null or refund_status in ('processed', 'failed', 'not_eligible'));

-- Lets a patient express "book with the same therapist as before" at
-- booking time. Purely a hint for the admin's assignment screen (which
-- still runs its normal conflict check) — never auto-assigns, since the
-- preferred therapist might not actually be available for the requested
-- slot.
alter table appointments add column if not exists preferred_therapist_id uuid references profiles(id);

-- Real, aggregated (never per-review) rating data exposed publicly.
-- Deliberately exposes only numbers, never individual patient names or
-- feedback text — publishing real patient reviews/names without an
-- explicit consent step is a separate, bigger decision than this platform
-- currently has a mechanism for; the existing hand-curated `testimonials`
-- table (implied consent obtained manually before an admin types a quote
-- in) remains the only source of individually-attributed public reviews.
drop view if exists public_therapist_profiles;
create view public_therapist_profiles as
select
  p.id, p.full_name, p.credentials, p.specialization, p.years_experience, p.bio, p.avatar_url,
  r.avg_rating, r.rating_count
from profiles p
left join (
  select therapist_id, avg(patient_rating)::numeric(3,2) as avg_rating, count(*) as rating_count
  from appointments
  where patient_rating is not null
  group by therapist_id
) r on r.therapist_id = p.id
-- active = true wasn't checked before this migration either, which meant a
-- suspended therapist still showed up on the public /team page — folded
-- into this same view rewrite since it's the same file/view.
where p.role = 'therapist' and p.approved = true and p.active = true;

grant select on public_therapist_profiles to anon, authenticated;

drop view if exists public_rating_summary;
create view public_rating_summary as
select
  avg(patient_rating)::numeric(3,2) as avg_rating,
  count(*) as rating_count
from appointments
where patient_rating is not null;

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

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

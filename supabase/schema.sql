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
begin
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
    coalesce(new.raw_user_meta_data->>'role', 'patient'),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'credentials',
    (coalesce(new.raw_user_meta_data->>'role', 'patient') = 'patient'),
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

-- A row-level policy only controls *which rows* a user can touch, not
-- *which columns* — without this, any signed-in user could open their
-- browser console and set their own "approved" to true or "role" to
-- 'therapist', bypassing the entire approval gate. Column-level grants
-- close that: "role" and "approved" can only be changed by an admin
-- (via the Supabase Table Editor / service role) or the signup trigger
-- above, which runs with elevated privileges and isn't subject to grants.
revoke update on profiles from authenticated;
grant update (full_name, phone, timezone, credentials) on profiles to authenticated;

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

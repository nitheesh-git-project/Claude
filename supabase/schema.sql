-- Run this in the Supabase SQL Editor (Project -> SQL Editor -> New query)
-- after creating your project. Safe to re-run (uses IF NOT EXISTS guards).

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('patient', 'therapist')),
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
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;
alter table appointments enable row level security;

-- Profiles: a user can read and create their own profile row.
-- NOTE: "approved" is intentionally left out of the update policy below —
-- until the admin portal (Phase 7) exists, flip it manually in the
-- Supabase Table Editor to approve a therapist.
drop policy if exists "profiles_select_own" on profiles;
create policy "profiles_select_own" on profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on profiles;
create policy "profiles_insert_own" on profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles
  for update using (auth.uid() = id);

-- Appointments: patients and their assigned therapist can see/manage a booking.
drop policy if exists "appointments_select_own" on appointments;
create policy "appointments_select_own" on appointments
  for select using (auth.uid() = patient_id or auth.uid() = therapist_id);

drop policy if exists "appointments_insert_own" on appointments;
create policy "appointments_insert_own" on appointments
  for insert with check (auth.uid() = patient_id);

drop policy if exists "appointments_update_own" on appointments;
create policy "appointments_update_own" on appointments
  for update using (auth.uid() = patient_id or auth.uid() = therapist_id);

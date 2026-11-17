-- ===========================================================================
-- WhatsApp (built, switched off), as one paste for the Supabase SQL editor.
--
-- Exactly the statements this PR appended to supabase/schema.sql. Re-runnable;
-- only ADDS three tables and a guard; changes no existing row. WhatsApp
-- starts OFF -- running this sends nothing. Run on STAGING after merging,
-- then on PRODUCTION at release (after scripts/email-package-2026-11.sql).
--
--   whatsapp_controls   the Settings -> WhatsApp switches (one row; starts OFF)
--   whatsapp_log        the last messages tried, masked number
--   whatsapp_consents   each patient's yes/no, append-only by trigger
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- WhatsApp: switches, send log and patients' consent (src/lib/whatsappRules.ts
-- has the rules, src/lib/whatsappServer.ts sends).
--
-- Built ready, switched off: whatsapp_controls starts with sending OFF, and
-- nothing is sent before the clinic's Meta Business account, its approved
-- templates and WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID exist.
--
-- whatsapp_consents is the evidence of what a patient agreed to: one row per
-- yes or no (from their profile, or a STOP reply to a message), the latest
-- wins, none is "no". APPEND-ONLY by trigger, like every evidence table here
-- (a route writes with the service role, which RLS does not stop). The patient
-- cascades, so scripts/clean-e2e-residue.mjs has nothing to learn and an
-- account deletion takes the rows with it. A patient reads their own rows.
--
-- whatsapp_log is one row per message the app tried, masked number and the
-- rendered text (which never holds health details), sent/skipped/failed and
-- why. Admin read only. The data reset truncates both (newest
-- debug_reset_all_data()); the switches are settings and stay.
-- ---------------------------------------------------------------------------
create table if not exists whatsapp_controls (
  id smallint primary key default 1 check (id = 1),
  sending_enabled boolean not null default false,
  test_number text check (test_number is null or test_number ~ '^[0-9]{8,15}$'),
  disabled_kinds text[] not null default '{}',
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into whatsapp_controls (id) values (1) on conflict (id) do nothing;

alter table whatsapp_controls enable row level security;

drop policy if exists "whatsapp_controls_select_admin" on whatsapp_controls;
create policy "whatsapp_controls_select_admin" on whatsapp_controls
  for select using (is_admin());

revoke insert, update, delete on whatsapp_controls from anon, authenticated;

create table if not exists whatsapp_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind ~ '^[a-z0-9_]{1,40}$'),
  recipient text not null check (length(recipient) <= 40),
  template text not null check (template ~ '^[a-z0-9_]{1,80}$'),
  preview text not null check (length(preview) <= 500),
  status text not null check (status in ('sent', 'skipped', 'failed')),
  reason text check (reason is null or reason ~ '^[a-z0-9_]{1,40}$'),
  redirected boolean not null default false,
  http_status integer
);

create index if not exists whatsapp_log_created_at_idx on whatsapp_log (created_at desc);

alter table whatsapp_log enable row level security;

drop policy if exists "whatsapp_log_select_admin" on whatsapp_log;
create policy "whatsapp_log_select_admin" on whatsapp_log
  for select using (is_admin());

revoke insert, update, delete on whatsapp_log from anon, authenticated;

create table if not exists whatsapp_consents (
  id bigint generated always as identity primary key,
  patient_id uuid not null references profiles(id) on delete cascade,
  choice text not null check (choice in ('granted', 'withdrawn')),
  source text not null check (source in ('profile', 'stop_reply', 'admin')),
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_consents_patient_idx on whatsapp_consents (patient_id, created_at desc);

alter table whatsapp_consents enable row level security;

drop policy if exists "whatsapp_consents_select_own" on whatsapp_consents;
create policy "whatsapp_consents_select_own" on whatsapp_consents
  for select using (patient_id = (select auth.uid()) or is_admin());

revoke insert, update, delete on whatsapp_consents from anon, authenticated;

create or replace function public.whatsapp_consents_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- The one change allowed: the row going with its patient's account
  -- (on delete cascade arrives here as a DELETE).
  if tg_op = 'DELETE' and not exists (select 1 from profiles where id = old.patient_id) then
    return old;
  end if;
  raise exception 'whatsapp_consents is append-only: record a new choice instead';
end;
$$;

drop trigger if exists trg_whatsapp_consents_guard on whatsapp_consents;
create trigger trg_whatsapp_consents_guard
  before update or delete on whatsapp_consents
  for each row execute function public.whatsapp_consents_guard();

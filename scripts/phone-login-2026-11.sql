-- ===========================================================================
-- Phone sign-in (built, switched off), as one paste for the Supabase SQL
-- editor: exactly the statements this PR appended to supabase/schema.sql.
-- Re-runnable; adds one table (the switch, starting OFF) and one server-only
-- function; changes no existing row. Run on STAGING after merging, then on
-- PRODUCTION at release. Going live: docs/auth/PHONE-SIGN-IN.md.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Phone sign-in (src/lib/phoneLogin.ts has the rules).
--
-- phone_login_controls is ONE row: whether the sign-in pages offer "sign in
-- with a phone code". It starts OFF -- texting codes needs an SMS provider on
-- the Supabase project (and a DLT-registered sender in India) -- and is read
-- on its own, never through SITE_SETTINGS_SELECT. Admins read it; the
-- service role writes it.
--
-- phone_login_account(phone) answers, for the server only, which account (if
-- any) has VERIFIED that number on its Supabase user, and its role and
-- active flag -- so /api/auth/phone/send can refuse to text a code to an
-- admin, or to anybody, without saying which. Supabase keeps the number as
-- digits without "+". security definer (it reads auth.users), revoked from
-- public, anon AND authenticated, explicit search_path, and granted back to
-- service_role right after.
-- ---------------------------------------------------------------------------
create table if not exists phone_login_controls (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default false,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into phone_login_controls (id) values (1) on conflict (id) do nothing;

alter table phone_login_controls enable row level security;

drop policy if exists "phone_login_controls_select_admin" on phone_login_controls;
create policy "phone_login_controls_select_admin" on phone_login_controls
  for select using (is_admin());

revoke insert, update, delete on phone_login_controls from anon, authenticated;

create or replace function public.phone_login_account(p_phone text)
returns table (user_id uuid, role text, active boolean)
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id, p.role, p.active
  from auth.users u
  join public.profiles p on p.id = u.id
  where u.phone = regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')
    and u.phone_confirmed_at is not null
    and u.deleted_at is null
  limit 1;
$$;

revoke all on function public.phone_login_account(text) from public;
revoke all on function public.phone_login_account(text) from anon;
revoke all on function public.phone_login_account(text) from authenticated;
grant execute on function public.phone_login_account(text) to service_role;

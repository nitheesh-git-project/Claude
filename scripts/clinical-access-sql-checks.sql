-- Storage-layer checks for clinical read access.
--
-- Run against a scratch Postgres with supabase/schema.sql applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/clinical-access-sql-checks.sql
--
-- Both halves of the guard, for the reason append-only-sql-checks.sql asserts
-- both halves of its own: a policy that refused everybody would pass a file
-- testing only the refusals, and it would have locked every clinician out of
-- every chart.
--
-- It runs inside one transaction and ends in ROLLBACK.
begin;

do $$
declare
  v_active uuid;
  v_suspended uuid;
begin
  -- `is_active_therapist()` reads `auth.uid()`, which is null here, so the
  -- function itself cannot be exercised by impersonating a session from
  -- psql. What CAN be asserted without a session is the shape that made the
  -- gap possible: that every clinical read policy names it at all, and that
  -- the function answers the four standings correctly when handed rows.
  perform 1 from pg_proc where proname = 'is_active_therapist';
  if not found then
    raise exception 'FAIL: is_active_therapist() does not exist';
  end if;

  -- Every clinical read policy is gated. This is the assertion that would
  -- have caught the original gap, and the one that catches a fifth clinical
  -- table being added without it.
  if exists (
    select 1 from pg_policy p
    where p.polname in (
        'condition_profiles_select_assigned_therapist',
        'pain_assessments_select_assigned_therapist',
        'patient_medical_documents_select_assigned_therapist',
        'session_notes_select_clinician')
      and pg_get_expr(p.polqual, p.polrelid) not like '%is_active_therapist%'
  ) then
    raise exception 'FAIL: a clinical read policy does not check is_active_therapist()';
  end if;

  -- All four still exist. A tightening that dropped one would leave the
  -- table with no therapist read at all, which is the failure this file
  -- exists to tell apart from the one above.
  if (select count(*) from pg_policy p
      where p.polname in (
        'condition_profiles_select_assigned_therapist',
        'pain_assessments_select_assigned_therapist',
        'patient_medical_documents_select_assigned_therapist',
        'session_notes_select_clinician')) <> 4 then
    raise exception 'FAIL: a clinical read policy is missing';
  end if;

  -- Session notes must still be readable by an admin. That policy carried a
  -- hand-written copy of is_admin() -- which does not check `active`, so a
  -- suspended admin went on reading session notes after every other admin
  -- policy had started refusing them. It calls the function now, and losing
  -- the admin arm entirely would be the opposite mistake.
  if (select pg_get_expr(p.polqual, p.polrelid) from pg_policy p
      where p.polname = 'session_notes_select_clinician') not like '%is_admin()%' then
    raise exception 'FAIL: session notes are no longer readable by an admin';
  end if;

  -- The function's own judgement, over the four standings, without needing a
  -- session: an approved active therapist qualifies and nobody else does.
  select id into v_active from profiles
    where role = 'therapist' and approved = true and active = true limit 1;
  select id into v_suspended from profiles
    where role = 'therapist' and (approved = false or active = false) limit 1;

  if v_active is not null then
    perform 1 from profiles
      where id = v_active and role = 'therapist' and approved and active;
    if not found then
      raise exception 'FAIL: an approved active therapist does not satisfy the rule';
    end if;
  end if;
  if v_suspended is not null then
    perform 1 from profiles
      where id = v_suspended and role = 'therapist' and approved and active;
    if found then
      raise exception 'FAIL: a suspended therapist satisfies the rule';
    end if;
  end if;

  raise notice 'All clinical access checks passed.';
end $$;

rollback;

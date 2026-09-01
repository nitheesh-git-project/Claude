-- Roster storage checks: the edge cases the two write functions have to
-- survive, asserted against a real Postgres.
--
-- Why this exists as SQL rather than as another Playwright spec: the e2e
-- suite reaches these functions through the API routes, which validate
-- first, so it can only ever send them well-formed input. These are the
-- cases where the *route* is not the thing being trusted -- a malformed
-- payload, a duplicate hour, an out-of-range value, a stale version -- and
-- the question is whether the database refuses cleanly or corrupts a
-- schedule.
--
-- Run against a scratch database that already has supabase/schema.sql
-- applied (never a database whose data matters -- this writes and deletes):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/roster-sql-checks.sql
--
-- It raises on the first failure and prints "roster SQL checks passed"
-- otherwise. Concurrency (two saves racing, a stale save, a double-clicked
-- Save, two exception writes on one date) is not here: it needs more than
-- one session, and it lives in e2e/therapist-roster.spec.ts.

do $$
declare
  v_therapist uuid;
  v_actor uuid;
  v_result jsonb;
  v_version bigint;
  v_count int;
  v_raised boolean;
begin
  -- Fixtures. Distinctive names so a leftover row is obvious.
  insert into profiles (role, full_name, email)
  values ('therapist', 'zz roster sql check', 'zz.roster.check@example.invalid')
  returning id into v_therapist;
  select id into v_actor from profiles where role = 'admin' limit 1;

  -- 1. A null payload is an empty week, not a crash.
  v_result := save_therapist_weekly_schedule(v_therapist, null, null, v_actor);
  if v_result->>'status' <> 'ok' then
    raise exception 'null slots should write an empty week, got %', v_result;
  end if;

  -- 2. A duplicated slot collapses to one row.
  v_result := save_therapist_weekly_schedule(
    v_therapist,
    '[{"day_of_week":1,"hour":9},{"day_of_week":1,"hour":9}]'::jsonb,
    null, v_actor);
  select count(*) into v_count from therapist_availability_template
   where therapist_id = v_therapist;
  if v_count <> 1 then
    raise exception 'a duplicated slot wrote % rows', v_count;
  end if;

  -- 3. A full week writes all 126 hours.
  v_result := save_therapist_weekly_schedule(
    v_therapist,
    (select jsonb_agg(jsonb_build_object('day_of_week', d, 'hour', h))
       from generate_series(0, 6) d, generate_series(6, 23) h),
    (v_result->>'version')::bigint, v_actor);
  select count(*) into v_count from therapist_availability_template
   where therapist_id = v_therapist;
  if v_count <> 126 then
    raise exception 'a full week wrote % rows, expected 126', v_count;
  end if;
  v_version := (v_result->>'version')::bigint;

  -- 4. An hour outside the business day is refused, and takes nothing with
  --    it -- the whole call rolls back rather than half-writing a week.
  begin
    v_raised := false;
    perform save_therapist_weekly_schedule(
      v_therapist, '[{"day_of_week":1,"hour":24}]'::jsonb, v_version, v_actor);
  exception when check_violation then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'hour 24 was accepted';
  end if;
  select count(*) into v_count from therapist_availability_template
   where therapist_id = v_therapist;
  if v_count <> 126 then
    raise exception 'a refused save left % rows behind', v_count;
  end if;

  -- 5. So is a day outside the week.
  begin
    v_raised := false;
    perform save_therapist_weekly_schedule(
      v_therapist, '[{"day_of_week":7,"hour":9}]'::jsonb, v_version, v_actor);
  exception when check_violation then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'day 7 was accepted';
  end if;

  -- 6. A version from another universe is a conflict, never a write.
  v_result := save_therapist_weekly_schedule(
    v_therapist, '[{"day_of_week":2,"hour":9}]'::jsonb, 4611686018427387904, v_actor);
  if v_result->>'status' <> 'conflict' then
    raise exception 'an absurd version gave %', v_result;
  end if;
  select count(*) into v_count from therapist_availability_template
   where therapist_id = v_therapist;
  if v_count <> 126 then
    raise exception 'a conflicted save wrote anyway (% rows)', v_count;
  end if;

  -- 7. The no-op path compares hours, not payload shape: a stale version
  --    asking for what is already stored -- in another order, with a
  --    repeat -- is a success with nothing to do.
  v_result := save_therapist_weekly_schedule(
    v_therapist,
    '[{"day_of_week":1,"hour":10},{"day_of_week":1,"hour":9}]'::jsonb,
    v_version, v_actor);
  v_version := (v_result->>'version')::bigint;
  v_result := save_therapist_weekly_schedule(
    v_therapist,
    '[{"day_of_week":1,"hour":9},{"day_of_week":1,"hour":10},{"day_of_week":1,"hour":9}]'::jsonb,
    v_version - 1, v_actor);
  if v_result->>'status' <> 'noop' then
    raise exception 'a re-sent identical schedule gave %', v_result;
  end if;

  -- 8. An exception payload naming one hour twice takes the last value.
  --    Postgres refuses an ON CONFLICT DO UPDATE whose own batch repeats a
  --    key, so without the dedupe this raises in front of whoever pressed
  --    Save.
  perform set_therapist_date_exception(
    v_therapist, date '2026-09-07',
    '[{"hour":9,"available":true},{"hour":9,"available":false},{"hour":10,"available":true}]'::jsonb,
    null, v_actor);
  select count(*) into v_count from therapist_availability_override
   where therapist_id = v_therapist and date = date '2026-09-07' and hour = 9 and available;
  if v_count <> 0 then
    raise exception 'a repeated hour kept the first value, not the last';
  end if;

  -- 9. An exception replaces its date whole: yesterday's rows do not
  --    survive underneath today's answer.
  perform set_therapist_date_exception(
    v_therapist, date '2026-09-07',
    (select jsonb_agg(jsonb_build_object('hour', h, 'available', false))
       from generate_series(6, 23) h),
    null, v_actor);
  select count(*) into v_count from therapist_availability_override
   where therapist_id = v_therapist and date = date '2026-09-07';
  if v_count <> 18 then
    raise exception 'a replaced date holds % rows, expected 18', v_count;
  end if;

  -- 10. Clearing hands the date back to the weekly schedule.
  perform set_therapist_date_exception(
    v_therapist, date '2026-09-07', '[]'::jsonb, null, v_actor);
  select count(*) into v_count from therapist_availability_override
   where therapist_id = v_therapist and date = date '2026-09-07';
  if v_count <> 0 then
    raise exception 'a cleared date left % rows', v_count;
  end if;

  -- 11. A blank note is stored as nothing, not as an empty string.
  perform set_therapist_date_exception(
    v_therapist, date '2026-10-01', '[{"hour":9,"available":true}]'::jsonb, '   ', v_actor);
  select count(*) into v_count from therapist_availability_override
   where therapist_id = v_therapist and date = date '2026-10-01' and note is not null;
  if v_count <> 0 then
    raise exception 'a blank note was stored as text';
  end if;

  -- 12. A past date is allowed. Correcting last week's roster is a real
  --     admin action, and nothing is sold out of it -- the booking
  --     lead-time rule is what stops that.
  perform set_therapist_date_exception(
    v_therapist, date '2020-01-01', '[{"hour":9,"available":false}]'::jsonb, 'backfill', v_actor);

  -- 13. Deleting the therapist takes the whole roster with them.
  delete from profiles where id = v_therapist;
  select count(*) into v_count from therapist_schedule_state where therapist_id = v_therapist;
  if v_count <> 0 then
    raise exception 'a deleted therapist left % schedule-state rows', v_count;
  end if;
  select count(*) into v_count from therapist_availability_template where therapist_id = v_therapist;
  if v_count <> 0 then
    raise exception 'a deleted therapist left % template rows', v_count;
  end if;
  select count(*) into v_count from therapist_availability_override where therapist_id = v_therapist;
  if v_count <> 0 then
    raise exception 'a deleted therapist left % exception rows', v_count;
  end if;

  raise notice 'roster SQL checks passed';
end $$;

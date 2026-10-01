-- What the pre-launch data reset clears, and what it must keep.
--
-- Both halves, the rule this repo's other SQL checks follow: the test data
-- that must go, next to the clinic's own writing that must survive. Checking
-- only the second would pass just as well on a reset that had stopped
-- clearing anything -- which, on the control whose whole job is emptying the
-- database, is the worse failure of the two.
--
-- The rule it encodes: **a data reset resets data, not configuration.**
-- Everything in `site_settings` is something a person chose -- the clinic's
-- name, its tagline, the email and phone patients contact it on, the mission,
-- the splash wording, every window and switch -- and testing generates none of
-- it. `faqs`, `testimonials` and `mission_principles` are the same thing as
-- rows. Clearing them handed an owner back a site calling itself something
-- else, with somebody else's contact details on it, every time they cleared a
-- few test patients.
--
-- **Never run this against a database anything else is using.** It runs inside
-- one transaction and ends in ROLLBACK, so it leaves nothing behind -- which
-- matters more here than anywhere else in this directory, since the thing
-- under test empties the database. But a ROLLBACK does not undo the *locks*:
-- `debug_reset_all_data()` TRUNCATEs ~60 tables, which takes an
-- AccessExclusiveLock on every one of them for the length of the transaction.
-- Anything reading concurrently blocks, and may deadlock.
--
-- Learned by doing it: this file was first run against the live project while
-- the Playwright suite was mid-run, and it took `admin-dashboard-ui` A-045
-- down with a deadlock -- a red line describing nothing but my own
-- carelessness, which is exactly the kind of failure that teaches people to
-- scroll past red lines. Stop the suite, or point this at a scratch project.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/debug-reset-sql-checks.sql
begin;

do $$
declare
  v_admin uuid;
  v_patient uuid;
  v_name_before text;
  v_name_after text;
  v_phone_after text;
  v_kept integer;
  v_patients_after integer;
  v_appts_after integer;
begin
  select id into v_admin from profiles where role = 'admin' limit 1;
  if v_admin is null then
    raise exception 'the reset refuses to run with no admin left behind - seed one first';
  end if;

  -- The clinic's own writing.
  update site_settings
     set site_name = 'Reset Check Clinic',
         contact_phone = '+919999999999',
         mission_statement = 'A sentence somebody typed.'
   where id;
  insert into faqs (question, answer) values ('kept through a reset?', 'yes');
  insert into testimonials (patient_name, quote) values ('A. Patient', 'Kept.');
  insert into mission_principles (kind, title, body)
  values ('promise', 'Kept through a reset', 'yes');
  select site_name into v_name_before from site_settings limit 1;

  -- Test data, of the kind a reset exists to clear.
  select id into v_patient from profiles where role = 'patient' limit 1;
  if v_patient is not null then
    insert into appointments (patient_id, slot_time, concern, status)
    values (v_patient, now() + interval '9 days', 'reset check', 'requested');
  end if;

  perform debug_reset_all_data();

  -- HALF ONE: the test data is gone. Asserted first, because a check that
  -- only proved the keeping would pass on a reset that no longer resets.
  select count(*) into v_patients_after from profiles where role <> 'admin';
  if v_patients_after <> 0 then
    raise exception 'FAILED: the reset left % non-admin account(s) behind', v_patients_after;
  end if;
  select count(*) into v_appts_after from appointments;
  if v_appts_after <> 0 then
    raise exception 'FAILED: the reset left % appointment(s) behind', v_appts_after;
  end if;

  -- HALF TWO: the clinic still knows who it is.
  select site_name, contact_phone into v_name_after, v_phone_after
    from site_settings limit 1;
  if v_name_after is distinct from v_name_before then
    raise exception 'FAILED: the reset changed the site name from % to %',
      v_name_before, v_name_after;
  end if;
  if v_phone_after is distinct from '+919999999999' then
    raise exception 'FAILED: the reset changed the clinic contact phone';
  end if;
  if (select mission_statement from site_settings limit 1)
     is distinct from 'A sentence somebody typed.' then
    raise exception 'FAILED: the reset replaced the mission somebody wrote';
  end if;

  select count(*) into v_kept from faqs where question = 'kept through a reset?';
  if v_kept <> 1 then
    raise exception 'FAILED: the reset removed an FAQ somebody wrote';
  end if;
  select count(*) into v_kept from testimonials where quote = 'Kept.';
  if v_kept <> 1 then
    raise exception 'FAILED: the reset removed a testimonial somebody wrote';
  end if;
  select count(*) into v_kept from mission_principles where title = 'Kept through a reset';
  if v_kept <> 1 then
    raise exception 'FAILED: the reset removed a promise somebody wrote';
  end if;

  raise notice 'OK: the reset clears the test data and keeps the clinic''s own writing';
end $$;

rollback;

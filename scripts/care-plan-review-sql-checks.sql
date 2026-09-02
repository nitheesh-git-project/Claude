-- The review step's storage layer, asserted against a scratch Postgres with
-- schema.sql applied:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/care-plan-review-sql-checks.sql
--
-- The sibling of scripts/roster-sql-checks.sql, and here for the same
-- reason: these are guarantees the API routes cannot break because they are
-- not the ones enforcing them. Every one of them survives a hand-run UPDATE
-- in the table editor, and that is the point -- an approval trail the
-- approved party can rewrite is not a trail, and "no route does that" is a
-- different claim from "that raises".
--
-- Everything runs inside one transaction and ends in ROLLBACK, so it leaves
-- no fixtures behind and can be run repeatedly against the same database.
-- Each check announces PASS; a failure raises and takes the transaction with
-- it.

\set ON_ERROR_STOP on
begin;

-- Fixtures: two profiles, a category, a package, a completed appointment.
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111','t@x.test'),
  ('22222222-2222-4222-8222-222222222222','p@x.test')
on conflict do nothing;

insert into profiles (id, role, full_name, email, approved, active) values
  ('11111111-1111-4111-8111-111111111111','therapist','T','t@x.test',true,true),
  ('22222222-2222-4222-8222-222222222222','patient','P','p@x.test',true,true)
on conflict (id) do nothing;

insert into treatment_categories (id, title, price_paise, duration_minutes)
values ('33333333-3333-4333-8333-333333333333','Cat',100000,45)
on conflict (id) do nothing;

insert into treatment_category_packages (id, category_id, title, session_count, price_paise)
values ('44444444-4444-4444-8444-444444444444','33333333-3333-4333-8333-333333333333','Pkg',6,600000)
on conflict (id) do nothing;

insert into appointments (id, patient_id, therapist_id, category_id, concern, slot_time, duration_minutes, status, payment_status)
values ('55555555-5555-4555-8555-555555555555','22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','Cat', now() - interval '2 days', 45, 'completed','paid')
on conflict (id) do nothing;

-- 1. A queued plan and a published one cannot coexist for one patient.
insert into care_plans (id, patient_id, therapist_id, status)
values ('66666666-6666-4666-8666-666666666666','22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','pending_review');

do $$
begin
  insert into care_plans (patient_id, therapist_id, status)
  values ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','active');
  raise exception 'FAIL: a second open plan was allowed';
exception when unique_violation then
  raise notice 'PASS: one open plan per patient covers pending_review';
end $$;

-- 2. The offer window is stamped once, and never moved.
insert into care_plan_versions (id, care_plan_id, version_no, authored_by, source_appointment_id, offer_kind, session_package_id)
values ('77777777-7777-4777-8777-777777777777','66666666-6666-4666-8666-666666666666',1,'11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','session_package','44444444-4444-4444-8444-444444444444');

update care_plan_versions set expires_at = now() + interval '30 days'
where id = '77777777-7777-4777-8777-777777777777';
do $$ begin raise notice 'PASS: a null offer window may be stamped once'; end $$;

do $$
begin
  update care_plan_versions set expires_at = now() + interval '60 days'
  where id = '77777777-7777-4777-8777-777777777777';
  raise exception 'FAIL: an offer window was moved after being set';
exception when raise_exception then
  if sqlerrm like 'FAIL:%' then raise; end if;
  raise notice 'PASS: an offer window cannot be moved once stamped';
end $$;

do $$
begin
  update care_plan_versions set clinical_rationale = 'changed'
  where id = '77777777-7777-4777-8777-777777777777';
  raise exception 'FAIL: a version was edited';
exception when raise_exception then
  if sqlerrm like 'FAIL:%' then raise; end if;
  raise notice 'PASS: a version is still append-only';
end $$;

-- 3. A review needs a real reason, and cannot be rewritten.
do $$
begin
  insert into care_plan_reviews (care_plan_id, version_id, reviewer_id, decision, reason)
  values ('66666666-6666-4666-8666-666666666666','77777777-7777-4777-8777-777777777777','11111111-1111-4111-8111-111111111111','approved','   ok   ');
  raise exception 'FAIL: a whitespace reason was accepted';
exception when check_violation then
  raise notice 'PASS: a review reason must be a real sentence';
end $$;

insert into care_plan_reviews (id, care_plan_id, version_id, reviewer_id, decision, reason)
values ('88888888-8888-4888-8888-888888888888','66666666-6666-4666-8666-666666666666','77777777-7777-4777-8777-777777777777','11111111-1111-4111-8111-111111111111','approved','Matches the assessment findings.');

do $$
begin
  update care_plan_reviews set reason = 'rewritten' where id = '88888888-8888-4888-8888-888888888888';
  raise exception 'FAIL: a review was edited';
exception when raise_exception then
  if sqlerrm like 'FAIL:%' then raise; end if;
  raise notice 'PASS: reviews are append-only';
end $$;

do $$
begin
  delete from care_plan_reviews where id = '88888888-8888-4888-8888-888888888888';
  raise exception 'FAIL: a review was deleted';
exception when raise_exception then
  if sqlerrm like 'FAIL:%' then raise; end if;
  raise notice 'PASS: reviews cannot be deleted';
end $$;

-- 4. The status check accepts the two new states and refuses nonsense.
do $$
begin
  update care_plans set status = 'nonsense' where id = '66666666-6666-4666-8666-666666666666';
  raise exception 'FAIL: an unknown status was accepted';
exception when check_violation then
  raise notice 'PASS: the status check still holds';
end $$;

update care_plans set status = 'rejected' where id = '66666666-6666-4666-8666-666666666666';
do $$ begin raise notice 'PASS: rejected is a real status'; end $$;

rollback;

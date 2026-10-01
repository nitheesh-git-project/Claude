-- One purchase cannot hold two sessions at the same instant (audit item 27).
--
-- Both halves of each guard, the rule this repo's other SQL checks follow:
-- the booking that must still land, next to the duplicate that must raise.
-- Checking only the refusals would pass just as well on an index that had
-- broken booking altogether.
--
-- It builds its own patient and purchase rather than finding one, for the
-- reason refund-attempt-sql-checks.sql does: this project has no appointments
-- at all, so a file that searched for a fixture would skip every assertion and
-- report a green run.
--
-- Runs inside one transaction and ends in ROLLBACK, so it leaves nothing
-- behind and can be re-run against the same database.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/booking-idempotency-sql-checks.sql
begin;

do $$
declare
  v_patient uuid;
  v_package uuid;
  v_purchase uuid;
  v_slot timestamptz := date_trunc('hour', now()) + interval '30 days';
  v_first uuid;
  v_second uuid;
  v_raised boolean;
begin
  select id into v_patient from profiles where role = 'patient' limit 1;
  if v_patient is null then
    raise exception 'no patient profile to build a fixture on - seed one first';
  end if;

  select id into v_package from home_visit_packages limit 1;
  if v_package is null then
    raise exception 'no home visit package to build a fixture on';
  end if;

  insert into home_visit_package_purchases
    (patient_id, package_id, visit_count, visits_used, status, payment_status)
  values (v_patient, v_package, 4, 0, 'active', 'paid')
  returning id into v_purchase;

  -- HALF ONE: the booking still lands.
  insert into appointments
    (patient_id, slot_time, concern, status, visit_mode, home_visit_purchase_id)
  values (v_patient, v_slot, 'idempotency check', 'requested', 'home_visit', v_purchase)
  returning id into v_first;
  if v_first is null then
    raise exception 'FAILED: an ordinary home visit booking did not land';
  end if;

  -- HALF TWO: the same purchase at the same instant raises.
  v_raised := false;
  begin
    insert into appointments
      (patient_id, slot_time, concern, status, visit_mode, home_visit_purchase_id)
    values (v_patient, v_slot, 'idempotency check', 'requested', 'home_visit', v_purchase);
  exception when unique_violation then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAILED: a second visit at the same slot on one purchase was allowed';
  end if;

  -- A DIFFERENT instant on the same purchase is ordinary and must still land:
  -- this is a booking rule nobody asked for if it refuses one.
  insert into appointments
    (patient_id, slot_time, concern, status, visit_mode, home_visit_purchase_id)
  values (v_patient, v_slot + interval '2 days', 'idempotency check', 'requested',
          'home_visit', v_purchase)
  returning id into v_second;
  if v_second is null then
    raise exception 'FAILED: a second visit at a different slot was refused';
  end if;

  -- And a CANCELLED row frees its slot: cancelling a visit and rebooking the
  -- same time is something patients do, and the index must not stop it.
  update appointments set status = 'cancelled' where id = v_first;
  insert into appointments
    (patient_id, slot_time, concern, status, visit_mode, home_visit_purchase_id)
  values (v_patient, v_slot, 'idempotency check', 'requested', 'home_visit', v_purchase);

  raise notice 'OK: home-visit purchase slot idempotency holds in both directions';
end $$;

-- The same shape for a session programme.
do $$
declare
  v_patient uuid;
  v_category uuid;
  v_package uuid;
  v_purchase uuid;
  v_slot timestamptz := date_trunc('hour', now()) + interval '31 days';
  v_raised boolean;
begin
  select id into v_patient from profiles where role = 'patient' limit 1;
  select id into v_category from treatment_categories limit 1;
  select id into v_package from treatment_category_packages limit 1;
  if v_package is null then
    raise notice 'SKIPPED: no session package on this database';
    return;
  end if;

  insert into patient_package_purchases
    (patient_id, package_id, category_id, session_count, sessions_used, status, payment_status)
  values (v_patient, v_package, v_category, 4, 0, 'active', 'paid')
  returning id into v_purchase;

  insert into appointments
    (patient_id, slot_time, concern, status, package_purchase_id)
  values (v_patient, v_slot, 'idempotency check', 'requested', v_purchase);

  v_raised := false;
  begin
    insert into appointments
      (patient_id, slot_time, concern, status, package_purchase_id)
    values (v_patient, v_slot, 'idempotency check', 'requested', v_purchase);
  exception when unique_violation then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAILED: a second programme session at the same slot was allowed';
  end if;

  raise notice 'OK: package purchase slot idempotency holds';
end $$;

rollback;

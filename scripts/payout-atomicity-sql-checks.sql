-- A payout settles all of its sessions or none of them (audit item 8).
--
-- Both halves of the guard, the rule this repo's other SQL checks follow: the
-- settlement that must land, next to the failure that must leave nothing
-- behind. Checking only the rollback would pass just as well on a function
-- that had broken settlement altogether -- which, on the largest money-moving
-- action in the app, is the worse outcome of the two.
--
-- It builds its own therapist, patient and appointments rather than finding
-- them, for the reason refund-attempt-sql-checks.sql does: this project has no
-- appointments, so a file that searched for fixtures would skip every
-- assertion and report a green run.
--
-- Runs inside one transaction and ends in ROLLBACK.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/payout-atomicity-sql-checks.sql
begin;

do $$
declare
  v_therapist uuid;
  v_patient uuid;
  v_batch uuid;
  v_a1 uuid;
  v_a2 uuid;
  v_settled integer;
  v_raised boolean;
begin
  select id into v_therapist from profiles where role = 'therapist' limit 1;
  select id into v_patient from profiles where role = 'patient' limit 1;
  if v_therapist is null or v_patient is null then
    raise exception 'need a therapist and a patient profile to build a fixture on';
  end if;

  insert into therapist_payout_batches (therapist_id, amount_paise, method)
  values (v_therapist, 0, 'online')
  returning id into v_batch;

  insert into appointments (patient_id, therapist_id, slot_time, concern, status, payment_status, amount_paid_paise)
  values (v_patient, v_therapist, now() - interval '3 days', 'payout check', 'completed', 'paid', 120000)
  returning id into v_a1;
  insert into appointments (patient_id, therapist_id, slot_time, concern, status, payment_status, amount_paid_paise)
  values (v_patient, v_therapist, now() - interval '2 days', 'payout check', 'completed', 'paid', 120000)
  returning id into v_a2;

  -- HALF ONE: an ordinary settlement lands, on every row, in one call.
  select count(*) into v_settled from settle_therapist_payout_batch(
    v_batch, now(), 'online', 'check',
    jsonb_build_array(
      jsonb_build_object('appointment_id', v_a1, 'payout_paise', 60000),
      jsonb_build_object('appointment_id', v_a2, 'payout_paise', 60000)
    )
  );
  if v_settled <> 2 then
    raise exception 'FAILED: expected 2 sessions settled, got %', v_settled;
  end if;
  if (select count(*) from appointments
       where id in (v_a1, v_a2) and therapist_payout_batch_id = v_batch
         and therapist_payout_paid_at is not null) <> 2 then
    raise exception 'FAILED: the settlement did not mark both rows';
  end if;

  -- HALF TWO: the compare-and-swap still holds. A second call claims nothing,
  -- so two admins settling at once cannot pay the same sessions twice.
  select count(*) into v_settled from settle_therapist_payout_batch(
    v_batch, now(), 'online', 'check',
    jsonb_build_array(jsonb_build_object('appointment_id', v_a1, 'payout_paise', 60000))
  );
  if v_settled <> 0 then
    raise exception 'FAILED: an already-settled session was claimed again';
  end if;

  raise notice 'OK: settlement lands on every row and cannot be claimed twice';
end $$;

-- HALF THREE: a bad payload leaves NOTHING settled. This is the whole point
-- of the item -- the old per-row loop would have marked the good row and left
-- the bad one, then answered 500 with the admin unable to tell how much had
-- been recorded.
do $$
declare
  v_therapist uuid;
  v_patient uuid;
  v_batch uuid;
  v_good uuid;
  v_raised boolean := false;
begin
  select id into v_therapist from profiles where role = 'therapist' limit 1;
  select id into v_patient from profiles where role = 'patient' limit 1;

  insert into therapist_payout_batches (therapist_id, amount_paise, method)
  values (v_therapist, 0, 'online')
  returning id into v_batch;

  insert into appointments (patient_id, therapist_id, slot_time, concern, status, payment_status, amount_paid_paise)
  values (v_patient, v_therapist, now() - interval '5 days', 'payout check', 'completed', 'paid', 120000)
  returning id into v_good;

  begin
    perform settle_therapist_payout_batch(
      v_batch, now(), 'online', 'check',
      jsonb_build_array(
        jsonb_build_object('appointment_id', v_good, 'payout_paise', 60000),
        -- No payout_paise: the function refuses the whole call.
        jsonb_build_object('appointment_id', v_good)
      )
    );
  exception when others then
    v_raised := true;
  end;

  if not v_raised then
    raise exception 'FAILED: a malformed settlement payload was accepted';
  end if;
  if (select therapist_payout_paid_at from appointments where id = v_good) is not null then
    raise exception 'FAILED: a failed settlement left a session marked settled';
  end if;

  raise notice 'OK: a failed settlement settles nothing at all';
end $$;

rollback;

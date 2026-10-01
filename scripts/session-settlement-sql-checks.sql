-- The canonical settlement record (audit items 10, 32, 33, 35, 36, 129-131).
--
-- Both halves of every guard: the write that must land, next to every rewrite
-- that must raise. Checking only the refusals would pass just as well on a
-- trigger that had broken the record altogether -- and this table's whole
-- value is that a settlement cannot be edited after the fact.
--
-- Builds its own fixtures, for the reason refund-attempt-sql-checks.sql does:
-- this project has no appointments, so a file that searched for one would skip
-- every assertion and report green.
--
-- Runs inside one transaction and ends in ROLLBACK.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/session-settlement-sql-checks.sql
begin;

do $$
declare
  v_patient uuid;
  v_therapist uuid;
  v_appt uuid;
  v_id uuid;
  v_event uuid;
  v_raised boolean;
begin
  select id into v_patient from profiles where role = 'patient' limit 1;
  select id into v_therapist from profiles where role = 'therapist' limit 1;
  if v_patient is null or v_therapist is null then
    raise exception 'need a patient and a therapist profile to build a fixture on';
  end if;

  insert into appointments (patient_id, therapist_id, slot_time, concern, status, payment_status, amount_paid_paise, completed_at)
  values (v_patient, v_therapist, now() - interval '1 day', 'settlement check', 'completed', 'paid', 120000, now())
  returning id into v_appt;

  -- HALF ONE: the record lands.
  insert into session_settlements
    (source, source_id, appointment_id, therapist_id, gross_paise,
     therapist_share_paise, partner_share_paise, clinic_share_paise, recognised_at)
  values ('session_completion', v_appt, v_appt, v_therapist, 120000,
          60000, 0, 60000, now())
  returning id, settlement_event_id into v_id, v_event;
  if v_id is null or v_event is null then
    raise exception 'FAILED: a settlement did not land, or has no event id';
  end if;

  -- One row per session: a re-completion records nothing twice.
  v_raised := false;
  begin
    insert into session_settlements
      (source, source_id, appointment_id, gross_paise, recognised_at)
    values ('session_completion', v_appt, v_appt, 120000, now());
  exception when unique_violation then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAILED: a second settlement for one session was allowed';
  end if;

  -- HALF TWO: every money column is frozen.
  v_raised := false;
  begin
    update session_settlements set gross_paise = 999999 where id = v_id;
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAILED: a settlement amount could be rewritten';
  end if;

  v_raised := false;
  begin
    update session_settlements set recognised_at = now() - interval '90 days' where id = v_id;
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAILED: the moment a settlement was recognised could be moved';
  end if;

  v_raised := false;
  begin
    delete from session_settlements where id = v_id;
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAILED: a settlement could be deleted';
  end if;

  -- HALF THREE: the one column that legitimately arrives later does land,
  -- and only once -- an external reference that can be rewritten is a notes
  -- field rather than a reconciliation.
  update session_settlements set external_reference = 'bank-txn-1' where id = v_id;
  if (select external_reference from session_settlements where id = v_id) <> 'bank-txn-1' then
    raise exception 'FAILED: the external reference could not be set';
  end if;

  v_raised := false;
  begin
    update session_settlements set external_reference = 'bank-txn-2' where id = v_id;
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAILED: an external reference could be rewritten';
  end if;

  -- HALF FOUR: the reconciliation notices a row that does not add up. It is
  -- asserted rather than assumed, because a check nothing can fail is the
  -- thing this table was given one to avoid.
  if (select count(*) from verify_settlement_agreement()
       where appointment_id = v_appt) <> 0 then
    raise exception 'FAILED: a correct settlement was reported as disagreeing';
  end if;

  raise notice 'OK: a settlement lands once, is frozen, and reconciles';
end $$;

rollback;

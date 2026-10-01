-- Storage-layer checks for `refund_attempts`, the record a refund writes
-- before the money moves.
--
-- Run against a scratch Postgres with supabase/schema.sql applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/refund-attempt-sql-checks.sql
--
-- It runs inside one transaction and ends in ROLLBACK, so it leaves nothing
-- behind and can be re-run against the same database.
--
-- It asserts BOTH halves of every guard, for the reason
-- append-only-sql-checks.sql does: a trigger that refused everything would
-- pass a file testing only the refusals, and it would have broken the
-- feature. So each resolution that must land is asserted to land, next to
-- every rewrite that must raise.
begin;

do $$
declare
  v_patient uuid;
  v_appointment uuid;
  v_attempt uuid;
  v_second uuid;
  v_raised boolean;
  v_health jsonb;
begin
  -- A row with no subject at all, and one with two, are both refused by the
  -- check rather than left to a reader to notice.
  begin
    insert into refund_attempts (purpose, razorpay_payment_id, amount_paise)
      values ('appointment', 'pay_none', 100);
    raise exception 'FAIL: an appointment attempt with no appointment was accepted';
  exception when check_violation then null;
  end;

  -- It BUILDS its own appointment rather than finding one, for the reason
  -- append-only-sql-checks.sql builds its own session note: a database with
  -- no appointments would otherwise skip every assertion below and report a
  -- green run. This project has none, so that is not hypothetical -- the
  -- first version of this file passed without testing anything.
  --
  -- Any profile will do as the patient: the foreign key wants a profiles
  -- row, not a role, and the whole transaction is rolled back.
  select id into v_patient from profiles limit 1;
  if v_patient is null then
    raise exception 'FAIL: no profiles at all, so no fixture can be built';
  end if;

  insert into appointments (patient_id, status, payment_status, amount_paid_paise)
    values (v_patient, 'cancelled', 'paid', 1200)
    returning id into v_appointment;

  -- Dated two hours back at INSERT, because `created_at` is one of the
  -- columns the append-only trigger freezes -- which is itself the point:
  -- the moment a refund was sent cannot be moved to make a stuck one look
  -- fresh. (The first draft of this file backdated it with an UPDATE and
  -- was refused, which is the negative control landing on its own.)
  insert into refund_attempts
      (purpose, appointment_id, razorpay_payment_id, amount_paise, reason, created_at)
    values ('appointment', v_appointment, 'pay_fixture', 1200, 'sql check',
            now() - interval '2 hours')
    returning id into v_attempt;

  -- It lands as `processing`, which is the whole point: the record exists
  -- before the gateway is called.
  perform 1 from refund_attempts where id = v_attempt and status = 'processing';
  if not found then raise exception 'FAIL: a new attempt is not processing'; end if;

  -- While it is processing and older than the window, the health function
  -- counts it.
  select refund_attempt_health(10) into v_health;
  if (v_health->>'stuck_count')::int < 1 then
    raise exception 'FAIL: a refund sent two hours ago is not reported as stuck';
  end if;

  -- ...and a refund genuinely in flight is not, or a working clinic carries
  -- a permanent red light. (600 minutes, so the two-hour-old fixture is
  -- inside the window rather than past it.)
  select refund_attempt_health(600) into v_health;
  if (v_health->>'stuck_count')::int <> 0 then
    raise exception 'FAIL: an attempt inside its window is reported as stuck';
  end if;

  -- A resolution to succeeded must land, and must carry the gateway's id.
  begin
    update refund_attempts set status = 'succeeded', resolved_at = now()
      where id = v_attempt;
    raise exception 'FAIL: a success with no gateway refund id was accepted';
  exception when check_violation then null;
  end;

  update refund_attempts
    set status = 'succeeded', razorpay_refund_id = 'rfnd_fixture', resolved_at = now()
    where id = v_attempt;
  perform 1 from refund_attempts where id = v_attempt and status = 'succeeded';
  if not found then raise exception 'FAIL: a refund attempt could not be resolved'; end if;

  -- Resolved once and never again. Two callers resolving one attempt is the
  -- race this exists to make impossible rather than unlikely.
  begin
    update refund_attempts set status = 'failed', resolved_at = now() where id = v_attempt;
    raise exception 'FAIL: an already-resolved attempt was resolved a second time';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  -- The facts of the attempt are frozen. What was asked for cannot be
  -- rewritten to match what happened, which is the only reason the
  -- disagreement between the two is worth reporting.
  begin
    update refund_attempts set amount_paise = 1 where id = v_attempt;
    raise exception 'FAIL: the amount of a refund attempt was rewritten';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  -- And nothing is ever deletable: a row that can be removed makes the
  -- stuck-at-processing state meaningless.
  begin
    delete from refund_attempts where id = v_attempt;
    raise exception 'FAIL: a refund attempt was deleted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  -- A succeeded refund whose appointment carries no `refund_id` is the
  -- second disagreement, and it is a different question from the first.
  select refund_attempt_health(600) into v_health;
  if (v_health->>'unrecorded_count')::int < 1 then
    raise exception 'FAIL: a succeeded refund with no id on its session is not reported';
  end if;

  -- A failed attempt needs no gateway id -- there is none -- but still says
  -- when it was decided.
  insert into refund_attempts (purpose, appointment_id, razorpay_payment_id, amount_paise)
    values ('appointment', v_appointment, 'pay_fixture2', 500)
    returning id into v_second;
  begin
    update refund_attempts set status = 'failed' where id = v_second;
    raise exception 'FAIL: a failure with no decision time was accepted';
  exception when check_violation then null;
  end;
  update refund_attempts
    set status = 'failed', resolved_at = now(), failure_detail = 'refused'
    where id = v_second;
  perform 1 from refund_attempts where id = v_second and status = 'failed';
  if not found then raise exception 'FAIL: an attempt could not be recorded as failed'; end if;

  -- A failed attempt is not money owed and must not be counted as either
  -- disagreement.
  select refund_attempt_health(1) into v_health;
  if (v_health->>'stuck_count')::int <> 0 then
    raise exception 'FAIL: a resolved attempt is still counted as in flight';
  end if;

  raise notice 'All refund_attempts checks passed.';
end $$;

rollback;

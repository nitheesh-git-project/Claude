-- The append-only guards' storage-layer check.
--
-- `session_credit_ledger` has carried this rule with its reasoning spelled
-- out since it shipped: "The revoke covers a browser session; every route in
-- this app writes with the service-role client, which bypasses RLS entirely.
-- For a table whose whole value is that it cannot be rewritten, 'no route
-- updates it' is not the same guarantee as 'an update raises'." Eight tables
-- were given that guard and four were not, and an audit found the gap by
-- simply issuing the UPDATE: `admin_activity_log` -- the trail the whole Logs
-- section is built on -- accepted a rewrite and changed a row.
--
-- Each table below permits exactly one legitimate mutation and refuses the
-- rest, so this file asserts both halves: the permitted write still lands,
-- and every other one raises. Checking only the refusals would pass just as
-- well on a trigger that had broken the feature.
--
-- It runs inside one transaction and ends in ROLLBACK, so it leaves nothing
-- behind and can be re-run against the same database. Applying `schema.sql`
-- twice against a scratch Postgres and then running this is what a schema
-- change to these tables should be verified with.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/append-only-sql-checks.sql
--
-- A failed assertion raises, which is what makes a silent pass impossible --
-- verified with a negative control before this file was trusted.

begin;
do $$
declare v_id uuid; v_actor uuid; v_note uuid; v_ok boolean;
begin
  select id into v_actor from profiles where role = 'admin' limit 1;
  if v_actor is null then raise exception 'no admin profile to attribute the probe row to'; end if;

  ---------------------------------------------------------------- 1
  insert into admin_activity_log (actor_id, action, target_label)
  values (v_actor, 'log.clear', 'append-only probe') returning id into v_id;

  v_ok := false;
  begin update admin_activity_log set target_label = 'rewritten' where id = v_id;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: admin_activity_log accepted an UPDATE'; end if;
  raise notice 'PASS  admin_activity_log refuses UPDATE';

  delete from admin_activity_log where id = v_id;
  if not found then raise exception 'FAIL: admin_activity_log DELETE removed nothing'; end if;
  raise notice 'PASS  admin_activity_log still allows DELETE (the retention purge)';

  ---------------------------------------------------------------- 2
  insert into payment_webhook_events (razorpay_event_id, event_type, payload)
  values ('probe_evt_appendonly', 'payment.captured', '{}'::jsonb);

  update payment_webhook_events set processed_at = now(), processing_error = null
   where razorpay_event_id = 'probe_evt_appendonly';
  raise notice 'PASS  payment_webhook_events still accepts its processed_at update';

  v_ok := false;
  begin update payment_webhook_events set razorpay_event_id = 'probe_rewritten'
         where razorpay_event_id = 'probe_evt_appendonly';
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: payment_webhook_events identity was rewritable'; end if;
  raise notice 'PASS  payment_webhook_events identity is frozen';

  v_ok := false;
  begin delete from payment_webhook_events where razorpay_event_id = 'probe_evt_appendonly';
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: payment_webhook_events row was deletable'; end if;
  raise notice 'PASS  payment_webhook_events refuses DELETE';

  ---------------------------------------------------------------- 3
  insert into payments (razorpay_order_id, amount_paise, status, purpose)
  values ('order_probe_appendonly', 100, 'created', 'consultation');

  update payments set status = 'captured', razorpay_payment_id = 'pay_probe_appendonly',
         captured_at = now()
   where razorpay_order_id = 'order_probe_appendonly';
  raise notice 'PASS  payments still accepts the created -> captured transition';

  v_ok := false;
  begin update payments set razorpay_order_id = 'order_probe_rewritten'
         where razorpay_order_id = 'order_probe_appendonly';
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: payments.razorpay_order_id was rewritable'; end if;
  raise notice 'PASS  payments.razorpay_order_id is frozen';

  v_ok := false;
  begin update payments set razorpay_payment_id = 'pay_probe_rewritten'
         where razorpay_order_id = 'order_probe_appendonly';
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: payments.razorpay_payment_id was rewritable once captured'; end if;
  raise notice 'PASS  payments.razorpay_payment_id is frozen once captured';

  v_ok := false;
  begin delete from payments where razorpay_order_id = 'order_probe_appendonly';
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: a captured payment was deletable'; end if;
  raise notice 'PASS  payments refuses DELETE';


  raise notice 'ALL APPEND-ONLY GUARDS HOLD';
end $$;

do $$
declare v_appt uuid; v_pat uuid; v_ther uuid; v_note uuid; v_id uuid; v_ok boolean;
begin
  -- Build the note this revision hangs off inside the transaction, so the
  -- guard is proven rather than skipped on a database that happens to have
  -- no session notes yet. Everything here rolls back.
  select a.id, a.patient_id, coalesce(a.therapist_id, (select id from profiles where role='therapist' limit 1))
    into v_appt, v_pat, v_ther
  from appointments a where a.patient_id is not null limit 1;
  if v_ther is null then raise exception 'no therapist to attribute the probe note to'; end if;

  insert into session_notes (appointment_id, patient_id, therapist_id, data)
  values (v_appt, v_pat, v_ther, '{}'::jsonb) returning id into v_note;

  insert into session_note_revisions (note_id, data, free_text)
  values (v_note, '{}'::jsonb, 'what the note used to say') returning id into v_id;

  v_ok := false;
  begin update session_note_revisions set free_text = 'rewritten' where id = v_id;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: session_note_revisions accepted an UPDATE'; end if;

  v_ok := false;
  begin delete from session_note_revisions where id = v_id;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: session_note_revisions row was deletable'; end if;

  raise notice 'PASS  session_note_revisions refuses UPDATE and DELETE';
end $$;
rollback;

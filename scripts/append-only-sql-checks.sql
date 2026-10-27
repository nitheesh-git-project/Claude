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
  -- Its own appointment too: this used to borrow whatever appointment an
  -- earlier spec on the same stack had left, and failed on a fresh stack
  -- whose specs had created none.
  select id into v_pat from profiles where role = 'patient' limit 1;
  select id into v_ther from profiles where role = 'therapist' limit 1;
  if v_pat is null or v_ther is null then
    raise exception 'no patient and therapist to attribute the probe note to (seed:qa runs first)';
  end if;
  insert into appointments (patient_id, therapist_id, slot_time, concern, status, payment_status, amount_paid_paise)
  values (v_pat, v_ther, now() - interval '3 days', 'append-only check', 'completed', 'paid', 0)
  returning id into v_appt;

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

-- user_activity_log: the patients', therapists' and hospitals' half of All
-- Logs. Unlike admin_activity_log it has no purge, so both UPDATE and DELETE
-- must raise. The sign-up trigger is checked in the same block: inserting a
-- patient profile must leave exactly one `account.created` entry.
begin;
do $$
declare v_id uuid; v_ok boolean;
begin
  insert into user_activity_log (actor_role, action, summary)
  values ('patient', 'appointment.cancelled', 'probe') returning id into v_id;

  v_ok := false;
  begin update user_activity_log set summary = 'rewritten' where id = v_id;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: user_activity_log accepted an UPDATE'; end if;

  v_ok := false;
  begin delete from user_activity_log where id = v_id;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: user_activity_log row was deletable'; end if;

  v_ok := false;
  begin insert into user_activity_log (actor_role, action, summary) values ('admin', 'x', 'probe');
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: user_activity_log accepted actor_role admin'; end if;

  raise notice 'PASS  user_activity_log refuses UPDATE and DELETE, and only holds non-admin actors';
end $$;
rollback;

-- outcome_measurements: the shared measurement layer. Append-only by
-- trigger, with exactly one permitted mutation -- appointment_id cleared to
-- NULL and nothing else (what `on delete set null` does when a session row
-- is deleted). care_milestones in the same block: a plan the therapist may
-- edit, except that a reached milestone's reached_at is recorded once.
begin;
do $$
declare v_id uuid; v_actor uuid; v_appt uuid; v_goal uuid; v_ms uuid; v_ok boolean;
begin
  select id into v_actor from profiles where role = 'admin' limit 1;
  if v_actor is null then raise exception 'no admin profile to attribute the probe rows to'; end if;

  insert into outcome_measurements (patient_id, measure_key, value, conditions, recorded_by, recorded_by_role, measured_at)
  values (v_actor, 'tug', 12.5, '{"setting":"in_person"}', v_actor, 'admin', now()) returning id into v_id;

  v_ok := false;
  begin update outcome_measurements set value = 9 where id = v_id;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: outcome_measurements accepted an UPDATE of value'; end if;

  v_ok := false;
  begin update outcome_measurements set appointment_id = null where id = v_id;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: outcome_measurements accepted an UPDATE with no appointment to clear'; end if;

  v_ok := false;
  begin delete from outcome_measurements where id = v_id;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: outcome_measurements row was deletable'; end if;

  -- The permitted half, where there is a session to link it to.
  select id into v_appt from appointments limit 1;
  if v_appt is not null then
    insert into outcome_measurements (patient_id, appointment_id, measure_key, value, conditions, recorded_by, recorded_by_role, measured_at)
    values (v_actor, v_appt, 'tug', 12.5, '{"setting":"in_person"}', v_actor, 'admin', now()) returning id into v_id;
    update outcome_measurements set appointment_id = null where id = v_id;
    v_ok := false;
    begin update outcome_measurements set appointment_id = null, value = 1 where id = v_id;
    exception when others then v_ok := true; end;
    if not v_ok then raise exception 'FAIL: outcome_measurements let a value ride along with the set-null'; end if;
  else
    raise notice 'SKIP  outcome_measurements set-null half: no appointment row to link';
  end if;

  insert into care_goals (patient_id, profile_kind, goal_text, authored_by, authored_by_role)
  values (v_actor, 'ortho', 'Probe goal', v_actor, 'admin') returning id into v_goal;
  insert into care_milestones (goal_id, patient_id, title, criterion, authored_by)
  values (v_goal, v_actor, 'Probe', 'Probe criterion', v_actor) returning id into v_ms;

  update care_milestones set title = 'Edited plan', status = 'working' where id = v_ms;
  update care_milestones set status = 'reached', reached_at = now() where id = v_ms;

  v_ok := false;
  begin update care_milestones set reached_at = now() - interval '1 day' where id = v_ms;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: care_milestones let reached_at move'; end if;

  v_ok := false;
  begin update care_milestones set status = 'working', reached_at = null where id = v_ms;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: care_milestones let a reached milestone be un-reached'; end if;

  v_ok := false;
  begin insert into care_milestones (goal_id, patient_id, title, criterion, status, authored_by)
    values (v_goal, v_actor, 'Probe', 'Probe criterion', 'reached', v_actor);
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: care_milestones accepted reached with no reached_at'; end if;

  raise notice 'PASS  outcome_measurements is append-only bar the set-null; a reached milestone stays reached';
end $$;
rollback;

-- care_milestone_events and reopen_care_milestone(): the one door through
-- which a reached milestone stops being reached. Both halves: the door
-- opens for the function (an event row and the milestone back at working,
-- reached_at cleared), and stays shut for everything else -- a direct
-- update still raises, an event written for a different reached_at does not
-- open it, a short reason and a milestone that is not reached are refused
-- as values, and the event row itself cannot be rewritten or deleted.
begin;
do $$
declare v_actor uuid; v_goal uuid; v_ms uuid; v_ok boolean; v_res jsonb; v_event uuid; v_status text; v_reached timestamptz;
begin
  select id into v_actor from profiles where role = 'admin' limit 1;
  if v_actor is null then raise exception 'no admin profile to attribute the probe rows to'; end if;

  insert into care_goals (patient_id, profile_kind, goal_text, authored_by, authored_by_role)
  values (v_actor, 'ortho', 'Probe goal', v_actor, 'admin') returning id into v_goal;
  insert into care_milestones (goal_id, patient_id, title, criterion, authored_by)
  values (v_goal, v_actor, 'Probe', 'Probe criterion', v_actor) returning id into v_ms;

  v_res := reopen_care_milestone(v_ms, v_actor, v_actor, 'Ticked the wrong row by mistake', 'working');
  if v_res->>'reason' is distinct from 'not_reached' then raise exception 'FAIL: reopened a milestone that was never reached: %', v_res; end if;

  update care_milestones set status = 'reached', reached_at = now() - interval '2 hours' where id = v_ms;

  v_res := reopen_care_milestone(v_ms, v_actor, v_actor, 'too short', 'working');
  if v_res->>'reason' is distinct from 'bad_reason' then raise exception 'FAIL: accepted a reason under 10 characters: %', v_res; end if;
  v_res := reopen_care_milestone(v_ms, v_actor, v_actor, 'Ticked the wrong row by mistake', 'reached');
  if v_res->>'reason' is distinct from 'bad_status' then raise exception 'FAIL: reopened to reached: %', v_res; end if;
  v_res := reopen_care_milestone(v_ms, gen_random_uuid(), v_actor, 'Ticked the wrong row by mistake', 'working');
  if v_res->>'reason' is distinct from 'not_found' then raise exception 'FAIL: reopened through another patient: %', v_res; end if;

  -- An event naming a different reached_at does not open the door.
  insert into care_milestone_events (milestone_id, patient_id, kind, previous_status, previous_reached_at, new_status, reason, actor_id, actor_role)
  values (v_ms, v_actor, 'reopened', 'reached', now() - interval '3 days', 'working', 'An unrelated earlier event', v_actor, 'admin');
  v_ok := false;
  begin update care_milestones set status = 'working', reached_at = null where id = v_ms;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: an event for another reached_at un-reached the milestone'; end if;

  v_res := reopen_care_milestone(v_ms, v_actor, v_actor, 'Ticked the wrong row by mistake', 'working');
  if (v_res->>'ok')::boolean is not true then raise exception 'FAIL: the reopen door did not open: %', v_res; end if;
  select status, reached_at into v_status, v_reached from care_milestones where id = v_ms;
  if v_status <> 'working' or v_reached is not null then raise exception 'FAIL: reopened milestone is % / %', v_status, v_reached; end if;
  v_event := (v_res->>'event_id')::uuid;

  v_ok := false;
  begin update care_milestone_events set reason = 'rewritten afterwards' where id = v_event;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: care_milestone_events accepted an UPDATE'; end if;
  v_ok := false;
  begin delete from care_milestone_events where id = v_event;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: care_milestone_events row was deletable'; end if;

  -- Reached again later: a new fact, and the guard holds it like the first.
  update care_milestones set status = 'reached', reached_at = now() where id = v_ms;
  v_ok := false;
  begin update care_milestones set reached_at = now() - interval '1 day' where id = v_ms;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: care_milestones let a second reached_at move'; end if;

  raise notice 'PASS  a reached milestone reopens only through reopen_care_milestone(), and the event is append-only';
end $$;
rollback;

-- care_status_events: the phase and status-override history (Health
-- Profile redesign, phase 3a). Append-only by trigger with no permitted
-- mutation at all, so the "permitted half" is the inserts themselves: each
-- of the three kinds lands, the shape CHECK refuses an override without a
-- reason of at least 10 characters (and a clear that carries a value), and
-- no row can then be rewritten or deleted -- the service role included.
begin;
do $$
declare v_actor uuid; v_id uuid; v_ok boolean; v_n integer;
begin
  select id into v_actor from profiles where role = 'admin' limit 1;
  if v_actor is null then raise exception 'no admin profile to attribute the probe rows to'; end if;

  insert into care_status_events (patient_id, kind, value, profile_kind, set_by, set_by_role)
  values (v_actor, 'phase', 'Strengthen', 'ortho', v_actor, 'admin');
  insert into care_status_events (patient_id, kind, value, reason, profile_kind, set_by, set_by_role)
  values (v_actor, 'status_override', 'needs_attention', 'New knee swelling today', 'ortho', v_actor, 'admin')
  returning id into v_id;
  insert into care_status_events (patient_id, kind, profile_kind, set_by, set_by_role)
  values (v_actor, 'override_cleared', 'ortho', v_actor, 'admin');
  select count(*) into v_n from care_status_events where patient_id = v_actor and set_by = v_actor;
  if v_n < 3 then raise exception 'FAIL: care_status_events refused a well-formed insert (% rows)', v_n; end if;

  v_ok := false;
  begin
    insert into care_status_events (patient_id, kind, value, reason, profile_kind, set_by, set_by_role)
    values (v_actor, 'status_override', 'steady', 'too short', 'ortho', v_actor, 'admin');
  exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: care_status_events accepted an override with a reason under 10 characters'; end if;

  v_ok := false;
  begin
    insert into care_status_events (patient_id, kind, value, profile_kind, set_by, set_by_role)
    values (v_actor, 'status_override', 'baseline', 'ortho', v_actor, 'admin');
  exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: care_status_events accepted an override that is not a judgement'; end if;

  v_ok := false;
  begin
    insert into care_status_events (patient_id, kind, value, profile_kind, set_by, set_by_role)
    values (v_actor, 'override_cleared', 'steady', 'ortho', v_actor, 'admin');
  exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: care_status_events accepted a clear carrying a value'; end if;

  v_ok := false;
  begin update care_status_events set reason = 'Rewritten afterwards' where id = v_id;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: care_status_events accepted an UPDATE'; end if;

  v_ok := false;
  begin delete from care_status_events where id = v_id;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: care_status_events row was deletable'; end if;

  raise notice 'PASS  care_status_events takes the three kinds, refuses a bad shape, and is append-only';
end $$;
rollback;

-- care_status_events, phase 4a: the fourth kind, 'summary' -- the
-- physiotherapist's written "Where things stand". The permitted half is the
-- insert (the text in `value`, up to 1,200 characters, no reason); the
-- shape CHECK refuses a blank one, one past the limit and one carrying a
-- reason, the kind CHECK still refuses an unknown kind, and a summary
-- cannot be rewritten afterwards -- the same trigger as the other three.
begin;
do $$
declare v_actor uuid; v_id uuid; v_ok boolean;
begin
  select id into v_actor from profiles where role = 'admin' limit 1;
  if v_actor is null then raise exception 'no admin profile to attribute the probe rows to'; end if;

  insert into care_status_events (patient_id, kind, value, profile_kind, set_by, set_by_role)
  values (v_actor, 'summary', 'Walking further each week. Next: stairs without the rail.', 'neuro_parkinsons', v_actor, 'admin')
  returning id into v_id;
  if v_id is null then raise exception 'FAIL: care_status_events refused a well-formed summary'; end if;

  v_ok := false;
  begin
    insert into care_status_events (patient_id, kind, value, profile_kind, set_by, set_by_role)
    values (v_actor, 'summary', '   ', 'ortho', v_actor, 'admin');
  exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: care_status_events accepted a blank summary'; end if;

  v_ok := false;
  begin
    insert into care_status_events (patient_id, kind, value, profile_kind, set_by, set_by_role)
    values (v_actor, 'summary', repeat('x', 1201), 'ortho', v_actor, 'admin');
  exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: care_status_events accepted a summary over 1,200 characters'; end if;

  v_ok := false;
  begin
    insert into care_status_events (patient_id, kind, value, reason, profile_kind, set_by, set_by_role)
    values (v_actor, 'summary', 'Doing well this week.', 'A reason does not belong here', 'ortho', v_actor, 'admin');
  exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: care_status_events accepted a summary carrying a reason'; end if;

  v_ok := false;
  begin
    insert into care_status_events (patient_id, kind, value, profile_kind, set_by, set_by_role)
    values (v_actor, 'diary', 'Not a kind', 'ortho', v_actor, 'admin');
  exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: care_status_events accepted an unknown kind'; end if;

  v_ok := false;
  begin update care_status_events set value = 'Rewritten afterwards' where id = v_id;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: care_status_events accepted an UPDATE of a summary'; end if;

  raise notice 'PASS  care_status_events takes a written summary, refuses a bad one, and keeps it append-only';
end $$;
rollback;

-- patient_diary_entries (phase 4a): the patient's diary. Both halves: an
-- entry lands, and a patient's entry takes its one-time confirmation stamp
-- (with the time set by the database, not the caller); everything else
-- raises -- an entry arriving already confirmed, a second confirmation, a
-- confirmation that also edits, a clinician's entry being confirmed, any
-- other edit, a delete, an entry dated tomorrow, half a confirmation, and
-- the same entry twice (the double-tap index).
begin;
do $$
declare v_actor uuid; v_id uuid; v_own uuid; v_ok boolean; v_at timestamptz;
begin
  select id into v_actor from profiles where role = 'admin' limit 1;
  if v_actor is null then raise exception 'no admin profile to attribute the probe rows to'; end if;

  insert into patient_diary_entries (patient_id, kind, occurred_at, details, note, entered_by, entered_by_role)
  values (v_actor, 'fall', now() - interval '1 day', '{"injured": false}'::jsonb, 'In the kitchen', v_actor, 'patient')
  returning id into v_id;
  insert into patient_diary_entries (patient_id, kind, occurred_at, details, entered_by, entered_by_role)
  values (v_actor, 'freezing', now() - interval '2 days', '{"period": "day", "count": 4}'::jsonb, v_actor, 'admin')
  returning id into v_own;

  -- The permitted change: the confirmation stamp, once, on a patient's entry.
  update patient_diary_entries
     set confirmed_by = v_actor, confirmed_by_role = 'therapist', confirmed_at = '2000-01-01T00:00:00Z'
   where id = v_id;
  select confirmed_at into v_at from patient_diary_entries where id = v_id;
  if v_at is null then raise exception 'FAIL: patient_diary_entries refused the confirmation stamp'; end if;
  if v_at < now() - interval '1 minute' then raise exception 'FAIL: patient_diary_entries kept the caller''s confirmation time (%)', v_at; end if;

  v_ok := false;
  begin update patient_diary_entries set confirmed_by_role = 'admin', confirmed_at = now() where id = v_id;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: patient_diary_entries took a second confirmation'; end if;

  v_ok := false;
  begin
    insert into patient_diary_entries (patient_id, kind, occurred_at, details, entered_by, entered_by_role)
    values (v_actor, 'near_miss', now() - interval '3 days', '{}'::jsonb, v_actor, 'patient')
    returning id into v_id;
    update patient_diary_entries
       set confirmed_by = v_actor, confirmed_by_role = 'therapist', confirmed_at = now(), note = 'Edited while confirming'
     where id = v_id;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: patient_diary_entries let a confirmation edit the entry'; end if;

  v_ok := false;
  begin update patient_diary_entries set confirmed_by = v_actor, confirmed_by_role = 'therapist', confirmed_at = now() where id = v_own;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: patient_diary_entries confirmed a clinician''s own entry'; end if;

  v_ok := false;
  begin update patient_diary_entries set details = '{"period": "day", "count": 1}'::jsonb where id = v_own;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: patient_diary_entries accepted an UPDATE'; end if;

  v_ok := false;
  begin delete from patient_diary_entries where id = v_own;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: patient_diary_entries row was deletable'; end if;

  v_ok := false;
  begin
    insert into patient_diary_entries (patient_id, kind, occurred_at, details, entered_by, entered_by_role, confirmed_by, confirmed_by_role, confirmed_at)
    values (v_actor, 'fall', now() - interval '4 days', '{"injured": true}'::jsonb, v_actor, 'patient', v_actor, 'therapist', now());
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: patient_diary_entries accepted an entry arriving already confirmed'; end if;

  v_ok := false;
  begin
    insert into patient_diary_entries (patient_id, kind, occurred_at, details, entered_by, entered_by_role)
    values (v_actor, 'fall', now() + interval '1 day', '{"injured": false}'::jsonb, v_actor, 'patient');
  exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: patient_diary_entries accepted an entry dated tomorrow'; end if;

  v_ok := false;
  begin
    insert into patient_diary_entries (patient_id, kind, occurred_at, details, entered_by, entered_by_role)
    values (v_actor, 'tremor', now() - interval '1 day', '{}'::jsonb, v_actor, 'patient');
  exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: patient_diary_entries accepted an unknown kind'; end if;

  v_ok := false;
  begin
    insert into patient_diary_entries (patient_id, kind, occurred_at, details, note, entered_by, entered_by_role)
    values (v_actor, 'fall', (select occurred_at from patient_diary_entries where note = 'In the kitchen' and patient_id = v_actor),
            '{"injured": false}'::jsonb, 'In the kitchen', v_actor, 'patient');
  exception when unique_violation then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: patient_diary_entries accepted the same entry twice'; end if;

  raise notice 'PASS  patient_diary_entries takes an entry and one confirmation, and refuses every other change';
end $$;
rollback;

-- peds_assessments: the paediatric examination (Health Profile redesign,
-- phase 5a). Append-only by trigger with no permitted mutation at all, like
-- neuro_assessments, so the "permitted half" is the insert itself: a
-- well-formed exam lands, the CHECKs refuse a non-object finding and an
-- author role that is neither therapist nor admin, and no row can then be
-- rewritten or deleted -- the service role included.
begin;
do $$
declare v_actor uuid; v_id uuid; v_ok boolean;
begin
  select id into v_actor from profiles where role = 'admin' limit 1;
  if v_actor is null then raise exception 'no admin profile to attribute the probe rows to'; end if;

  insert into peds_assessments (patient_id, submitted_by, submitted_by_role, schema_version, findings)
  values (v_actor, v_actor, 'admin', 1,
          '{"milestones": {"sitting_without_support": {"status": "achieved", "firstSeenOn": "2026-03-01", "source": "seen"}}}'::jsonb)
  returning id into v_id;
  if v_id is null then raise exception 'FAIL: peds_assessments refused a well-formed insert'; end if;

  v_ok := false;
  begin
    insert into peds_assessments (patient_id, submitted_by, submitted_by_role, findings)
    values (v_actor, v_actor, 'admin', '[]'::jsonb);
  exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: peds_assessments accepted findings that are not an object'; end if;

  v_ok := false;
  begin
    insert into peds_assessments (patient_id, submitted_by, submitted_by_role, findings)
    values (v_actor, v_actor, 'patient', '{}'::jsonb);
  exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: peds_assessments accepted an exam written by a patient'; end if;

  v_ok := false;
  begin update peds_assessments set findings = '{"milestones": {}}'::jsonb where id = v_id;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: peds_assessments accepted an UPDATE'; end if;

  v_ok := false;
  begin delete from peds_assessments where id = v_id;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: peds_assessments row was deletable'; end if;

  raise notice 'PASS  peds_assessments takes an exam and refuses every change to it';
end $$;
rollback;

-- The guided video assessment (Health Profile redesign, phase 7a). Three
-- tables, both halves each:
--   assessment_runs: a run lands, a second run in progress for the same
--     patient is refused (the partial unique index), ending it once lands
--     with the end time set by the trigger, and then nothing changes -- a
--     second end, an edit and a delete all raise;
--   assessment_run_events: an event lands while the run is in progress and
--     is never rewritten or deleted; a measurement id on anything but a save
--     is refused by the CHECK; an event into an ended run raises;
--   assessment_live_display: the patient-safe keys land and may be updated
--     (it is a live screen, not evidence), and any other key -- a result --
--     is refused by the CHECK.
begin;
do $$
declare v_actor uuid; v_run uuid; v_event uuid; v_ok boolean; v_ended timestamptz;
begin
  select id into v_actor from profiles where role = 'admin' limit 1;
  if v_actor is null then raise exception 'no admin profile to attribute the probe rows to'; end if;

  insert into assessment_runs (patient_id, therapist_id, protocol_key, protocol_version, profile_kind)
  values (v_actor, v_actor, 'ortho_knee', 1, 'ortho')
  returning id into v_run;
  if v_run is null then raise exception 'FAIL: assessment_runs refused a well-formed run'; end if;

  v_ok := false;
  begin
    insert into assessment_runs (patient_id, therapist_id, protocol_key, protocol_version, profile_kind)
    values (v_actor, v_actor, 'ortho_knee', 1, 'ortho');
  exception when unique_violation then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: assessment_runs accepted a second run in progress for one patient'; end if;

  insert into assessment_run_events (run_id, step_id, kind, details, actor)
  values (v_run, 'safety', 'setup_confirmed', '{"items": ["clear_space"], "helperPresent": false}'::jsonb, v_actor)
  returning id into v_event;
  if v_event is null then raise exception 'FAIL: assessment_run_events refused a well-formed event'; end if;

  v_ok := false;
  begin
    insert into assessment_run_events (run_id, step_id, kind, measurement_id, actor)
    values (v_run, 'walk', 'stopped', gen_random_uuid(), v_actor);
  exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: assessment_run_events accepted a measurement on a stop'; end if;

  v_ok := false;
  begin update assessment_run_events set details = '{}'::jsonb where id = v_event;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: assessment_run_events accepted an UPDATE'; end if;

  v_ok := false;
  begin delete from assessment_run_events where id = v_event;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: assessment_run_events row was deletable'; end if;

  insert into assessment_live_display (run_id, patient_id, therapist_id, protocol_key, current_step_id, phase, display)
  values (v_run, v_actor, v_actor, 'ortho_knee', 'safety', 'ready',
          '{"progress": "Step 1 of 8", "title": "Safety check", "line": "A few safety questions first.", "picture": "sitting"}'::jsonb);
  update assessment_live_display set phase = 'go', clock_started_at = now(), clock_seconds = 30 where run_id = v_run;

  v_ok := false;
  begin update assessment_live_display set display = display || '{"result": "9 stands"}'::jsonb where run_id = v_run;
  exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: assessment_live_display accepted a key that is not patient-safe'; end if;

  -- Ending: the one permitted change, with the end time the database's own.
  update assessment_runs set status = 'completed', ended_at = '2000-01-01T00:00:00Z' where id = v_run;
  select ended_at into v_ended from assessment_runs where id = v_run;
  if v_ended is null or v_ended < now() - interval '1 minute' then
    raise exception 'FAIL: assessment_runs kept the caller''s end time instead of setting its own';
  end if;

  v_ok := false;
  begin update assessment_runs set status = 'abandoned', ended_reason = 'other' where id = v_run;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: assessment_runs accepted a second end'; end if;

  v_ok := false;
  begin update assessment_runs set protocol_key = 'neuro' where id = v_run;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: assessment_runs accepted an edit'; end if;

  v_ok := false;
  begin delete from assessment_runs where id = v_run;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: assessment_runs row was deletable'; end if;

  v_ok := false;
  begin
    insert into assessment_run_events (run_id, step_id, kind, actor) values (v_run, 'walk', 'step_opened', v_actor);
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: assessment_run_events accepted an event into an ended run'; end if;

  raise notice 'PASS  assessment_runs ends once, assessment_run_events is append-only, assessment_live_display takes patient-safe keys only';
end $$;
rollback;

-- Home exercises (Health Profile redesign, phase 7d). Three tables and the
-- publish function, both halves each:
--   publish_exercise_plan(): version 1 lands active with its items in
--     order; version 2 replaces it (the trigger stamps replaced_at) and is
--     the one active; a publish whose item a CHECK refuses rolls back whole,
--     leaving version 2 active; a run that is not this therapist's in
--     progress is refused;
--   exercise_plans: the one change is active -> replaced; an edit, a second
--     replace, a delete and a direct insert as 'replaced' all raise;
--   exercise_plan_items: append-only; an item onto a replaced version
--     raises;
--   exercise_teaching_events: a mark lands inside the run in progress for an
--     exercise in the active plan; a second mark for it, a bad shape, an
--     unknown cue, an exercise not in the plan, a replaced plan, another
--     therapist, an edit, a delete and a mark into an ended run all raise;
--   assessment_live_display: the demo phase with the exercise key lands,
--     and a key inside `exercise` that is not the library's raises.
-- (The items' "only in the transaction that publishes the plan" half cannot
-- be driven from one transaction; it is the same `now()` the plan stamps.)
begin;
do $$
declare
  v_patient uuid; v_therapist uuid; v_run uuid; v_res jsonb; v_v1 uuid; v_v2 uuid;
  v_ok boolean; v_n integer; v_event uuid; v_replaced timestamptz;
  v_items jsonb := '[
    {"exercise_key": "sit_to_stand", "dose": {"sets": 2, "reps": 10, "holdSeconds": null, "minutes": null, "timesPerDay": 1, "daysPerWeek": 5, "note": null}, "milestone_id": null},
    {"exercise_key": "heel_raise", "dose": {"sets": 2, "reps": 10, "holdSeconds": null, "minutes": null, "timesPerDay": 1, "daysPerWeek": 3, "note": "Hold the counter."}, "milestone_id": null}
  ]'::jsonb;
begin
  select id into v_patient from profiles where role = 'patient' limit 1;
  select id into v_therapist from profiles where role = 'therapist' limit 1;
  if v_patient is null or v_therapist is null then raise exception 'no patient and therapist to attribute the probe rows to'; end if;

  insert into assessment_runs (patient_id, therapist_id, protocol_key, protocol_version, profile_kind)
  values (v_patient, v_therapist, 'geriatric', 2, 'geriatric') returning id into v_run;

  v_res := publish_exercise_plan(v_patient, v_therapist, v_run, null, 'geriatric', v_items);
  v_v1 := (v_res ->> 'id')::uuid;
  if (v_res ->> 'version')::int <> 1 then raise exception 'FAIL: the first version is not version 1'; end if;
  select count(*) into v_n from exercise_plan_items where plan_id = v_v1;
  if v_n <> 2 then raise exception 'FAIL: the first version did not take its two items'; end if;
  if (select exercise_key from exercise_plan_items where plan_id = v_v1 and sort_order = 1) <> 'heel_raise' then
    raise exception 'FAIL: the items did not keep their order';
  end if;

  v_res := publish_exercise_plan(v_patient, v_therapist, v_run, null, 'geriatric', v_items);
  v_v2 := (v_res ->> 'id')::uuid;
  if (v_res ->> 'version')::int <> 2 then raise exception 'FAIL: the second version is not version 2'; end if;
  select replaced_at into v_replaced from exercise_plans where id = v_v1 and status = 'replaced';
  if v_replaced is null then raise exception 'FAIL: version 1 was not replaced, with its time stamped'; end if;
  select count(*) into v_n from exercise_plans where patient_id = v_patient and status = 'active';
  if v_n <> 1 then raise exception 'FAIL: % active versions for one patient', v_n; end if;

  v_ok := false;
  begin
    perform publish_exercise_plan(v_patient, v_therapist, v_run, null, 'geriatric',
      '[{"exercise_key": "walking", "dose": {"sets": 1, "minutes": 10, "timesPerDay": 1, "daysPerWeek": 5, "price": 100}}]'::jsonb);
  exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: publish_exercise_plan accepted a dose with an unknown key'; end if;
  if not exists (select 1 from exercise_plans where id = v_v2 and status = 'active') then
    raise exception 'FAIL: a refused publish took the active version away';
  end if;

  v_ok := false;
  begin perform publish_exercise_plan(v_patient, v_patient, v_run, null, 'geriatric', v_items);
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: publish_exercise_plan accepted a run that is not the author''s'; end if;

  v_ok := false;
  begin update exercise_plans set version = 9 where id = v_v2;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: exercise_plans accepted an edit'; end if;

  v_ok := false;
  begin update exercise_plans set status = 'active', replaced_at = null where id = v_v1;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: exercise_plans brought a replaced version back'; end if;

  v_ok := false;
  begin delete from exercise_plans where id = v_v1;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: exercise_plans row was deletable'; end if;

  v_ok := false;
  begin
    insert into exercise_plans (patient_id, version, authored_by, profile_kind, status, replaced_at)
    values (v_patient, 7, v_therapist, 'geriatric', 'replaced', now());
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: exercise_plans accepted a version inserted as replaced'; end if;

  v_ok := false;
  begin update exercise_plan_items set dose = jsonb_set(dose, '{reps}', '30') where plan_id = v_v2;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: exercise_plan_items accepted an UPDATE'; end if;

  v_ok := false;
  begin delete from exercise_plan_items where plan_id = v_v2;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: exercise_plan_items row was deletable'; end if;

  v_ok := false;
  begin
    insert into exercise_plan_items (plan_id, exercise_key, dose, sort_order)
    values (v_v1, 'walking', '{"sets": 1, "minutes": 10, "timesPerDay": 1, "daysPerWeek": 5}'::jsonb, 5);
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: exercise_plan_items accepted an item on a replaced version'; end if;

  insert into exercise_teaching_events (run_id, plan_id, patient_id, exercise_key, outcome, actor)
  values (v_run, v_v2, v_patient, 'sit_to_stand', 'performed_correctly', v_therapist) returning id into v_event;
  insert into exercise_teaching_events (run_id, plan_id, patient_id, exercise_key, outcome, cue_key, actor)
  values (v_run, v_v2, v_patient, 'heel_raise', 'needs_practice', 'hold_support', v_therapist);

  v_ok := false;
  begin
    insert into exercise_teaching_events (run_id, plan_id, patient_id, exercise_key, outcome, actor)
    values (v_run, v_v2, v_patient, 'sit_to_stand', 'performed_correctly', v_therapist);
  exception when unique_violation then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: exercise_teaching_events took a second mark for one exercise'; end if;

  v_ok := false;
  begin
    insert into exercise_teaching_events (run_id, plan_id, patient_id, exercise_key, outcome, actor)
    values (v_run, v_v2, v_patient, 'heel_raise', 'needs_practice', v_therapist);
  exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: exercise_teaching_events accepted needs practice with no cue'; end if;

  v_ok := false;
  begin
    insert into exercise_teaching_events (run_id, plan_id, patient_id, exercise_key, outcome, cue_key, actor)
    values (v_run, v_v2, v_patient, 'heel_raise', 'needs_practice', 'you_did_great', v_therapist);
  exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: exercise_teaching_events accepted a cue that is not on the list'; end if;

  v_ok := false;
  begin
    insert into exercise_teaching_events (run_id, plan_id, patient_id, exercise_key, outcome, actor)
    values (v_run, v_v2, v_patient, 'walking', 'performed_correctly', v_therapist);
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: exercise_teaching_events accepted an exercise not in the plan'; end if;

  v_ok := false;
  begin
    insert into exercise_teaching_events (run_id, plan_id, patient_id, exercise_key, outcome, actor)
    values (v_run, v_v1, v_patient, 'heel_raise', 'performed_correctly', v_therapist);
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: exercise_teaching_events accepted a mark on a replaced version'; end if;

  v_ok := false;
  begin
    insert into exercise_teaching_events (run_id, plan_id, patient_id, exercise_key, outcome, reason_key, actor)
    values (v_run, v_v2, v_patient, 'heel_raise', 'not_attempted', 'too_painful', v_patient);
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: exercise_teaching_events accepted a mark from someone other than the run''s therapist'; end if;

  v_ok := false;
  begin update exercise_teaching_events set outcome = 'needs_practice', cue_key = 'slow_down' where id = v_event;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: exercise_teaching_events accepted an UPDATE'; end if;

  v_ok := false;
  begin delete from exercise_teaching_events where id = v_event;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: exercise_teaching_events row was deletable'; end if;

  insert into assessment_live_display (run_id, patient_id, therapist_id, protocol_key, current_step_id, phase, display)
  values (v_run, v_patient, v_therapist, 'geriatric', 'exercises', 'demo',
          '{"progress": "Step 8 of 9", "title": "Sit to stand", "line": "Watch how it is done.", "picture": "standing",
            "exercise": {"key": "sit_to_stand", "picture": "sit_to_stand", "steps": ["Sit near the front of a firm chair."], "counter": "Exercise 1 of 2"}}'::jsonb);

  v_ok := false;
  begin
    update assessment_live_display set display = jsonb_set(display, '{exercise,note}', '"You did 12"') where run_id = v_run;
  exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: assessment_live_display accepted a key inside the exercise that is not the library''s'; end if;

  update assessment_runs set status = 'completed' where id = v_run;
  v_ok := false;
  begin
    insert into exercise_teaching_events (run_id, plan_id, patient_id, exercise_key, outcome, reason_key, actor)
    values (v_run, v_v2, v_patient, 'heel_raise', 'not_attempted', 'out_of_time', v_therapist);
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: exercise_teaching_events accepted a mark into an ended run'; end if;

  raise notice 'PASS  exercise plans publish in one transaction and replace, items and teaching events are append-only, the demo display takes library keys only';
end $$;
rollback;

-- Home exercises: correcting a mark (phase 7d-3), both halves:
--   a correction of this run's mark lands, and a second one of the latest
--     (the chain) lands too -- the originals stay;
--   a correction with no reason, a reason off the list, a mark that carries
--     a reason, a correction of a row already corrected (a fork), and one
--     that references another exercise, another run, another patient or
--     another therapist all raise;
--   a second plain mark is still refused (the partial unique index), and an
--     edit and a delete of a correction raise;
--   a browser session cannot read the correction columns (column privileges).
begin;
do $$
declare
  v_patient uuid; v_patient2 uuid; v_therapist uuid; v_run uuid; v_run2 uuid; v_res jsonb; v_plan uuid;
  v_ok boolean; v_n integer; v_mark uuid; v_other uuid; v_fix1 uuid; v_fix2 uuid; v_run2_mark uuid;
  v_items jsonb := '[
    {"exercise_key": "sit_to_stand", "dose": {"sets": 2, "reps": 10, "holdSeconds": null, "minutes": null, "timesPerDay": 1, "daysPerWeek": 5, "note": null}, "milestone_id": null},
    {"exercise_key": "heel_raise", "dose": {"sets": 2, "reps": 10, "holdSeconds": null, "minutes": null, "timesPerDay": 1, "daysPerWeek": 3, "note": null}, "milestone_id": null}
  ]'::jsonb;
begin
  select id into v_patient from profiles where role = 'patient' limit 1;
  select id into v_therapist from profiles where role = 'therapist' limit 1;
  if v_patient is null or v_therapist is null then raise exception 'no patient and therapist to attribute the probe rows to'; end if;

  insert into assessment_runs (patient_id, therapist_id, protocol_key, protocol_version, profile_kind)
  values (v_patient, v_therapist, 'geriatric', 2, 'geriatric') returning id into v_run;
  v_res := publish_exercise_plan(v_patient, v_therapist, v_run, null, 'geriatric', v_items);
  v_plan := (v_res ->> 'id')::uuid;

  insert into exercise_teaching_events (run_id, plan_id, patient_id, exercise_key, outcome, actor)
  values (v_run, v_plan, v_patient, 'sit_to_stand', 'performed_correctly', v_therapist) returning id into v_mark;
  insert into exercise_teaching_events (run_id, plan_id, patient_id, exercise_key, outcome, cue_key, actor)
  values (v_run, v_plan, v_patient, 'heel_raise', 'needs_practice', 'hold_support', v_therapist) returning id into v_other;
  if (select kind from exercise_teaching_events where id = v_mark) <> 'mark' then raise exception 'FAIL: a mark did not default to kind mark'; end if;

  -- The permitted half: a correction, then a correction of that correction.
  insert into exercise_teaching_events (run_id, plan_id, patient_id, exercise_key, outcome, cue_key, actor, kind, corrects_event_id, correction_reason)
  values (v_run, v_plan, v_patient, 'sit_to_stand', 'needs_practice', 'slow_down', v_therapist, 'correction', v_mark, 'wrong_button')
  returning id into v_fix1;
  insert into exercise_teaching_events (run_id, plan_id, patient_id, exercise_key, outcome, actor, kind, corrects_event_id, correction_reason)
  values (v_run, v_plan, v_patient, 'sit_to_stand', 'performed_correctly', v_therapist, 'correction', v_fix1, 'tried_again_correctly')
  returning id into v_fix2;
  select count(*) into v_n from exercise_teaching_events where run_id = v_run and exercise_key = 'sit_to_stand';
  if v_n <> 3 then raise exception 'FAIL: the original mark and its two corrections are not all kept (% rows)', v_n; end if;

  v_ok := false;
  begin
    insert into exercise_teaching_events (run_id, plan_id, patient_id, exercise_key, outcome, actor, kind, corrects_event_id)
    values (v_run, v_plan, v_patient, 'sit_to_stand', 'performed_correctly', v_therapist, 'correction', v_fix2);
  exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: a correction with no reason landed'; end if;

  v_ok := false;
  begin
    insert into exercise_teaching_events (run_id, plan_id, patient_id, exercise_key, outcome, actor, kind, corrects_event_id, correction_reason)
    values (v_run, v_plan, v_patient, 'sit_to_stand', 'performed_correctly', v_therapist, 'correction', v_fix2, 'patient_said_so');
  exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: a correction reason that is not on the list landed'; end if;

  v_ok := false;
  begin
    insert into exercise_teaching_events (run_id, plan_id, patient_id, exercise_key, outcome, actor, correction_reason)
    values (v_run, v_plan, v_patient, 'heel_raise', 'performed_correctly', v_therapist, 'wrong_button');
  exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: a plain mark carried a correction reason'; end if;

  v_ok := false;
  begin
    insert into exercise_teaching_events (run_id, plan_id, patient_id, exercise_key, outcome, reason_key, actor, kind, corrects_event_id, correction_reason)
    values (v_run, v_plan, v_patient, 'sit_to_stand', 'not_attempted', 'out_of_time', v_therapist, 'correction', v_mark, 'see_summary');
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: a second correction of the original (a fork) landed'; end if;

  v_ok := false;
  begin
    insert into exercise_teaching_events (run_id, plan_id, patient_id, exercise_key, outcome, actor, kind, corrects_event_id, correction_reason)
    values (v_run, v_plan, v_patient, 'heel_raise', 'performed_correctly', v_therapist, 'correction', v_fix2, 'wrong_button');
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: a correction landed against another exercise''s mark'; end if;

  v_ok := false;
  begin
    insert into exercise_teaching_events (run_id, plan_id, patient_id, exercise_key, outcome, cue_key, actor)
    values (v_run, v_plan, v_patient, 'heel_raise', 'needs_practice', 'slow_down', v_therapist);
  exception when unique_violation then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: a second plain mark for one exercise landed beside its correction rule'; end if;

  v_ok := false;
  begin update exercise_teaching_events set correction_reason = 'see_summary' where id = v_fix1;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: a correction accepted an UPDATE'; end if;

  v_ok := false;
  begin delete from exercise_teaching_events where id = v_fix2;
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: a correction was deletable'; end if;

  -- Another run (the first ends; a new one starts): its own mark, and a
  -- correction of it that references the FIRST run's row, raises.
  update assessment_runs set status = 'completed' where id = v_run;
  insert into assessment_runs (patient_id, therapist_id, protocol_key, protocol_version, profile_kind)
  values (v_patient, v_therapist, 'geriatric', 2, 'geriatric') returning id into v_run2;
  insert into exercise_teaching_events (run_id, plan_id, patient_id, exercise_key, outcome, actor)
  values (v_run2, v_plan, v_patient, 'heel_raise', 'performed_correctly', v_therapist) returning id into v_run2_mark;
  v_ok := false;
  begin
    insert into exercise_teaching_events (run_id, plan_id, patient_id, exercise_key, outcome, cue_key, actor, kind, corrects_event_id, correction_reason)
    values (v_run2, v_plan, v_patient, 'heel_raise', 'needs_practice', 'slow_down', v_therapist, 'correction', v_other, 'wrong_button');
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: a correction landed against another run''s mark'; end if;

  -- Another patient's run correcting this patient's mark raises (the run
  -- check and the reference check both refuse it).
  select id into v_patient2 from profiles where role = 'patient' and id <> v_patient limit 1;
  if v_patient2 is null then
    v_patient2 := gen_random_uuid();
    insert into auth.users (id, email) values (v_patient2, 'probe-correction@probe.test');
    insert into profiles (id, role, full_name, email, approved) values (v_patient2, 'patient', 'Probe Two', 'probe-correction@probe.test', true)
    on conflict (id) do nothing;
  end if;
  v_ok := false;
  begin
    insert into exercise_teaching_events (run_id, plan_id, patient_id, exercise_key, outcome, actor, kind, corrects_event_id, correction_reason)
    values (v_run2, v_plan, v_patient2, 'heel_raise', 'performed_correctly', v_therapist, 'correction', v_run2_mark, 'wrong_button');
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: a correction landed for another patient'; end if;

  -- Another therapist correcting this therapist's mark raises.
  v_ok := false;
  begin
    insert into exercise_teaching_events (run_id, plan_id, patient_id, exercise_key, outcome, actor, kind, corrects_event_id, correction_reason)
    values (v_run2, v_plan, v_patient, 'heel_raise', 'performed_correctly', v_patient, 'correction', v_run2_mark, 'wrong_button');
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FAIL: a correction landed from someone other than the run''s therapist'; end if;

  -- And the correction of this run's own mark lands.
  insert into exercise_teaching_events (run_id, plan_id, patient_id, exercise_key, outcome, cue_key, actor, kind, corrects_event_id, correction_reason)
  values (v_run2, v_plan, v_patient, 'heel_raise', 'needs_practice', 'slow_down', v_therapist, 'correction', v_run2_mark, 'see_summary');

  -- What a browser session may read: the original columns, not the correction ones.
  if has_column_privilege('authenticated', 'exercise_teaching_events', 'correction_reason', 'select')
     or has_column_privilege('authenticated', 'exercise_teaching_events', 'kind', 'select')
     or has_column_privilege('authenticated', 'exercise_teaching_events', 'corrects_event_id', 'select')
     or has_column_privilege('anon', 'exercise_teaching_events', 'outcome', 'select') then
    raise exception 'FAIL: a browser session can read a correction column';
  end if;
  if not has_column_privilege('authenticated', 'exercise_teaching_events', 'cue_key', 'select') then
    raise exception 'FAIL: the patient can no longer read their own marks';
  end if;

  raise notice 'PASS  exercise_teaching_events takes a correction chain of this run''s marks, refuses every other one, and keeps the correction columns from a browser';
end $$;
rollback;

-- Storage-layer checks for claim_therapist_slot().
--
-- The atomic therapist-slot reservation every booking path now goes through.
-- These assert the properties the six hand-rolled check-then-write sequences
-- it replaced could not hold, plus the ones they did hold, so a regression in
-- either direction fails here rather than as a double-booked therapist.
--
-- Runs inside one transaction and ends in ROLLBACK, so it leaves nothing
-- behind and can be re-run against the same database.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/therapist-slot-sql-checks.sql
--
-- Concurrency is deliberately NOT asserted here: one psql session cannot
-- race itself, so that property is proved by firing parallel RPCs at the
-- function instead (see e2e/therapist-slot-claim.spec.ts), exactly as the
-- rate limiter's own checks say about their cap.
begin;

do $$
declare
  v_patient uuid;
  v_patient_2 uuid;
  v_therapist_a uuid;
  v_therapist_b uuid;
  v_appt_1 uuid;
  v_appt_2 uuid;
  v_appt_3 uuid;
  v_ref uuid;
  v_hospital uuid;
  v_slot timestamptz := date_trunc('hour', now()) + interval '30 days';
  v_res jsonb;
begin
  -- ---- fixtures -----------------------------------------------------
  -- profiles.id is a foreign key onto auth.users, and the signup trigger is
  -- what normally creates both halves. These rows are created directly
  -- because the whole block rolls back -- nothing here reaches a real
  -- account -- and because going through GoTrue would make a storage-layer
  -- check depend on an HTTP service.
  v_patient := gen_random_uuid();
  v_patient_2 := gen_random_uuid();
  v_therapist_a := gen_random_uuid();
  v_therapist_b := gen_random_uuid();
  v_hospital := gen_random_uuid();

  -- Email is supplied because the signup trigger on auth.users copies it
  -- into profiles, where it is NOT NULL -- inserting a bare id makes the
  -- trigger fail rather than this statement.
  insert into auth.users (id, email) values
    (v_patient,     'slotchk.patient@example.test'),
    (v_patient_2,   'slotchk.patient2@example.test'),
    (v_therapist_a, 'slotchk.a@example.test'),
    (v_therapist_b, 'slotchk.b@example.test'),
    (v_hospital,    'slotchk.hospital@example.test');

  -- The signup trigger populates profiles from auth.users, so the rows may
  -- already exist by the time this runs; update rather than insert so the
  -- check does not depend on whether that trigger fired.
  insert into profiles (id, role, full_name, approved, active, email)
    values (v_patient, 'patient', 'SLOTCHK patient', true, true, 'slotchk.patient@example.test')
    on conflict (id) do update
      set role = 'patient', approved = true, active = true;
  insert into profiles (id, role, full_name, approved, active, email)
    values (v_therapist_a, 'therapist', 'SLOTCHK therapist A', true, true, 'slotchk.a@example.test')
    on conflict (id) do update
      set role = 'therapist', approved = true, active = true;
  insert into profiles (id, role, full_name, approved, active, email)
    values (v_therapist_b, 'therapist', 'SLOTCHK therapist B', true, true, 'slotchk.b@example.test')
    on conflict (id) do update
      set role = 'therapist', approved = true, active = true;

  insert into appointments (patient_id, slot_time, duration_minutes, status)
    values (v_patient, v_slot, 60, 'requested') returning id into v_appt_1;
  -- A second patient for the overlapping booking. One patient cannot hold
  -- two overlapping sessions at all since appointments_patient_no_overlap
  -- landed, which refused this fixture before a single check ran; CHECK 2
  -- is about the *therapist's* calendar, so two patients is the honest
  -- shape for it anyway.
  insert into profiles (id, role, full_name, approved, active, email)
    values (v_patient_2, 'patient', 'SLOTCHK patient 2', true, true, 'slotchk.patient2@example.test')
    on conflict (id) do update
      set role = 'patient', approved = true, active = true;
  insert into appointments (patient_id, slot_time, duration_minutes, status)
    values (v_patient_2, v_slot + interval '30 minutes', 60, 'requested')
    returning id into v_appt_2;
  insert into appointments (patient_id, slot_time, duration_minutes, status)
    values (v_patient, v_slot + interval '4 hours', 60, 'requested')
    returning id into v_appt_3;

  -- ---- 1. a clean claim succeeds -------------------------------------
  v_res := claim_therapist_slot(v_appt_1, v_therapist_a, null, true, 0, false);
  if not (v_res->>'ok')::boolean then
    raise exception 'CHECK 1 failed: a clean claim was refused (%)', v_res;
  end if;
  if (select therapist_id from appointments where id = v_appt_1) is distinct from v_therapist_a then
    raise exception 'CHECK 1 failed: the therapist was not written';
  end if;

  -- ---- 2. an overlapping claim on the SAME therapist is refused ------
  -- This is the double-booking the old read-then-write could not stop.
  v_res := claim_therapist_slot(v_appt_2, v_therapist_a, null, true, 0, false);
  if (v_res->>'ok')::boolean then
    raise exception 'CHECK 2 failed: an overlapping session was allowed';
  end if;
  if v_res->>'reason' <> 'conflict' then
    raise exception 'CHECK 2 failed: expected reason=conflict, got %', v_res;
  end if;
  if (select therapist_id from appointments where id = v_appt_2) is not null then
    raise exception 'CHECK 2 failed: a refused claim still wrote a therapist';
  end if;

  -- ---- 3. the SAME slot on a DIFFERENT therapist is fine -------------
  -- The lock is per therapist, and must not serialise the whole clinic.
  v_res := claim_therapist_slot(v_appt_2, v_therapist_b, null, true, 0, false);
  if not (v_res->>'ok')::boolean then
    raise exception 'CHECK 3 failed: a different therapist was blocked (%)', v_res;
  end if;

  -- ---- 4. a non-overlapping slot on the same therapist is fine -------
  v_res := claim_therapist_slot(v_appt_3, v_therapist_a, null, true, 0, false);
  if not (v_res->>'ok')::boolean then
    raise exception 'CHECK 4 failed: a clear later slot was refused (%)', v_res;
  end if;

  -- ---- 5. the compare-and-set refuses a stale reassignment -----------
  -- appt_1 is on therapist A. A caller who read it as unassigned has a
  -- stale view and must be refused rather than silently overwriting.
  v_res := claim_therapist_slot(v_appt_1, v_therapist_b, null, true, 0, false);
  if (v_res->>'ok')::boolean then
    raise exception 'CHECK 5 failed: a stale unassigned-claim overwrote an assignment';
  end if;
  if v_res->>'reason' <> 'reassigned' then
    raise exception 'CHECK 5 failed: expected reason=reassigned, got %', v_res;
  end if;

  -- ---- 6. a caller naming the WRONG current therapist is refused -----
  v_res := claim_therapist_slot(v_appt_1, v_therapist_b, v_therapist_b, false, 0, false);
  if (v_res->>'ok')::boolean then
    raise exception 'CHECK 6 failed: a wrong expected-therapist CAS was accepted';
  end if;

  -- ---- 7. a caller naming the RIGHT current therapist may reassign ---
  -- appt_3 is on A and does not clash with anything on B.
  v_res := claim_therapist_slot(v_appt_3, v_therapist_b, v_therapist_a, false, 0, false);
  if not (v_res->>'ok')::boolean then
    raise exception 'CHECK 7 failed: a correct CAS reassignment was refused (%)', v_res;
  end if;
  if (v_res->>'previous_therapist_id')::uuid is distinct from v_therapist_a then
    raise exception 'CHECK 7 failed: the previous therapist was not reported back';
  end if;

  -- ---- 8. p_confirm only confirms when asked -------------------------
  if (select status from appointments where id = v_appt_3) <> 'requested' then
    raise exception 'CHECK 8 failed: status moved without p_confirm';
  end if;
  v_res := claim_therapist_slot(v_appt_3, v_therapist_b, v_therapist_b, false, 0, true);
  if (select status from appointments where id = v_appt_3) <> 'confirmed' then
    raise exception 'CHECK 8 failed: p_confirm did not confirm';
  end if;

  -- ---- 9. a cancelled session does not hold its slot -----------------
  update appointments set status = 'cancelled' where id = v_appt_1;
  v_res := claim_therapist_slot(v_appt_2, v_therapist_a, v_therapist_b, false, 0, false);
  if not (v_res->>'ok')::boolean then
    raise exception 'CHECK 9 failed: a cancelled session still blocked its slot (%)', v_res;
  end if;

  -- ---- 10. an invite_sent referral DOES hold its slot ----------------
  -- The half a pure appointments check misses: two referrals could
  -- otherwise be assigned the same therapist and hour, and neither would
  -- surface until one of them converted.
  insert into profiles (id, role, full_name, approved, active, email)
    values (v_hospital, 'hospital', 'SLOTCHK hospital', true, true, 'slotchk.hospital@example.test')
    on conflict (id) do update
      set role = 'hospital', approved = true, active = true;
  insert into patient_referrals
    (hospital_id, patient_name, medical_issue, status, assigned_therapist_id, assigned_slot_time)
    values (v_hospital, 'SLOTCHK referred', 'knee', 'invite_sent', v_therapist_a,
            v_slot + interval '8 hours')
    returning id into v_ref;

  update appointments set therapist_id = null, status = 'requested',
         slot_time = v_slot + interval '8 hours' where id = v_appt_1;
  v_res := claim_therapist_slot(v_appt_1, v_therapist_a, null, true, 0, false);
  if (v_res->>'ok')::boolean then
    raise exception 'CHECK 10 failed: a held referral slot was double-booked';
  end if;

  -- ---- 11. ...unless it is the referral being converted ---------------
  v_res := claim_therapist_slot(v_appt_1, v_therapist_a, null, true, 0, false, v_ref);
  if not (v_res->>'ok')::boolean then
    raise exception 'CHECK 11 failed: a referral could not convert its own slot (%)', v_res;
  end if;

  -- ---- 12. the travel buffer widens the window -----------------------
  -- appt_3 sits 4 hours out on therapist B with nothing near it; a session
  -- 30 minutes later is clear at buffer 0 and clashes at buffer 45.
  update appointments set therapist_id = null, status = 'requested',
         slot_time = v_slot + interval '5 hours', duration_minutes = 60
   where id = v_appt_2;
  update appointments set therapist_id = v_therapist_b,
         slot_time = v_slot + interval '4 hours', duration_minutes = 60
   where id = v_appt_3;

  v_res := claim_therapist_slot(v_appt_2, v_therapist_b, null, true, 0, false);
  if not (v_res->>'ok')::boolean then
    raise exception 'CHECK 12 failed: a clear back-to-back slot was refused at buffer 0 (%)', v_res;
  end if;

  update appointments set therapist_id = null where id = v_appt_2;
  v_res := claim_therapist_slot(v_appt_2, v_therapist_b, null, true, 45, false);
  if (v_res->>'ok')::boolean then
    raise exception 'CHECK 12 failed: a 45-minute travel buffer did not block a back-to-back visit';
  end if;

  -- ---- 13. a missing appointment or therapist is named, not raised ---
  v_res := claim_therapist_slot(gen_random_uuid(), v_therapist_a, null, true, 0, false);
  if v_res->>'reason' <> 'no_appointment' then
    raise exception 'CHECK 13 failed: expected no_appointment, got %', v_res;
  end if;
  v_res := claim_therapist_slot(v_appt_1, gen_random_uuid(), null, true, 0, false);
  if v_res->>'reason' <> 'no_therapist' then
    raise exception 'CHECK 13 failed: expected no_therapist, got %', v_res;
  end if;

  -- ---- 14. a reschedule is tested against the slot it moves TO ------
  -- The property that made the reschedule path atomic: passing a new time
  -- must make the overlap test judge that time, not the one on the row.
  -- appt_2 currently sits clear; move it onto therapist B's occupied hour
  -- and it must be refused without having written anything.
  update appointments set therapist_id = null, status = 'requested',
         slot_time = v_slot + interval '20 hours' where id = v_appt_2;
  update appointments set therapist_id = v_therapist_b, status = 'requested',
         slot_time = v_slot + interval '30 hours', duration_minutes = 60
   where id = v_appt_3;

  v_res := claim_therapist_slot(
    v_appt_2, v_therapist_b, null, true, 0, false, null,
    v_slot + interval '30 hours', 60, null
  );
  if (v_res->>'ok')::boolean then
    raise exception 'CHECK 14 failed: a reschedule onto a taken hour was allowed';
  end if;
  if (select slot_time from appointments where id = v_appt_2)
       <> v_slot + interval '20 hours' then
    raise exception 'CHECK 14 failed: a refused reschedule still moved the slot';
  end if;

  -- ---- 15. a reschedule onto a free hour writes every field ---------
  v_res := claim_therapist_slot(
    v_appt_2, v_therapist_b, null, true, 0, false, null,
    v_slot + interval '40 hours', 90, null
  );
  if not (v_res->>'ok')::boolean then
    raise exception 'CHECK 15 failed: a clear reschedule was refused (%)', v_res;
  end if;
  if (select slot_time from appointments where id = v_appt_2)
       <> v_slot + interval '40 hours' then
    raise exception 'CHECK 15 failed: the new slot was not written';
  end if;
  if (select duration_minutes from appointments where id = v_appt_2) <> 90 then
    raise exception 'CHECK 15 failed: the new duration was not written';
  end if;
  if (v_res->>'previous_slot_time')::timestamptz <> v_slot + interval '20 hours' then
    raise exception 'CHECK 15 failed: the previous slot was not reported back';
  end if;

  -- ---- 16. an assign-only claim leaves the slot alone -----------------
  -- coalesce, not overwrite: a caller that only assigns must not blank the
  -- time, the length or the category.
  update appointments set therapist_id = null where id = v_appt_2;
  v_res := claim_therapist_slot(v_appt_2, v_therapist_b, null, true, 0, false);
  if not (v_res->>'ok')::boolean then
    raise exception 'CHECK 16 failed: an assign-only claim was refused (%)', v_res;
  end if;
  if (select slot_time from appointments where id = v_appt_2)
       <> v_slot + interval '40 hours' then
    raise exception 'CHECK 16 failed: an assign-only claim moved the slot';
  end if;
  if (select duration_minutes from appointments where id = v_appt_2) <> 90 then
    raise exception 'CHECK 16 failed: an assign-only claim changed the duration';
  end if;

  raise notice 'All claim_therapist_slot checks passed.';
end $$;

rollback;

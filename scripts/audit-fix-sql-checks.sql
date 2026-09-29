-- Storage-layer checks for the database-level guards added by the audit fix
-- pass. Runs inside one transaction and ends in ROLLBACK, so it leaves
-- nothing behind and can be re-run against the same database.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/audit-fix-sql-checks.sql
--
-- A negative control was run for each block before it was trusted: an
-- assertion that cannot fail makes a green run mean nothing.
begin;

-- ---------------------------------------------------------------------------
-- The medical-document cap is enforced by the database, not only by the route
-- ---------------------------------------------------------------------------
-- The upload route counted and refused at the cap, which is a
-- select-then-insert with a real window: a multi-file picker fires several
-- uploads that all read the same count, all pass and all insert. The cap is
-- the only thing bounding this bucket's growth, since nothing here sweeps it.
do $$
declare v_p uuid := gen_random_uuid(); i int;
begin
  insert into auth.users (id, email) values (v_p, 'doccap@example.test');
  insert into profiles (id, role, full_name, approved, active, email)
    values (v_p, 'patient', 'DOCCAP', true, true, 'doccap@example.test')
    on conflict (id) do update set role = 'patient';

  -- The cap itself must still admit exactly 20.
  for i in 1..20 loop
    insert into patient_medical_documents (patient_id, storage_path, title, mime_type, size_bytes)
      values (v_p, 'p/'||i||'.pdf', 'doc '||i, 'application/pdf', 10);
  end loop;

  if (select count(*) from patient_medical_documents where patient_id = v_p) <> 20 then
    raise exception 'DOC CAP failed: the 20 permitted documents did not all land';
  end if;

  -- ...and refuse the 21st.
  begin
    insert into patient_medical_documents (patient_id, storage_path, title, mime_type, size_bytes)
      values (v_p, 'p/21.pdf', 'doc 21', 'application/pdf', 10);
    raise exception 'DOC CAP failed: the 21st document was accepted';
  exception when check_violation then
    null; -- expected
  end;

  -- A different patient is unaffected: the cap is per patient, and the lock
  -- must not serialise the whole table.
  declare v_q uuid := gen_random_uuid();
  begin
    insert into auth.users (id, email) values (v_q, 'doccap2@example.test');
    insert into profiles (id, role, full_name, approved, active, email)
      values (v_q, 'patient', 'DOCCAP2', true, true, 'doccap2@example.test')
      on conflict (id) do update set role = 'patient';
    insert into patient_medical_documents (patient_id, storage_path, title, mime_type, size_bytes)
      values (v_q, 'q/1.pdf', 'doc 1', 'application/pdf', 10);
  end;

  raise notice 'Document cap checks passed.';
end $$;

-- ---------------------------------------------------------------------------
-- A referral cannot be declined without a real reason
-- ---------------------------------------------------------------------------
-- Declining is the one outcome in that flow that takes something away, and it
-- recorded nothing but a status word -- so the partner who sent the patient
-- could not tell a wrong-specialty referral from a capacity problem that
-- would pass, and kept sending the same ones.
do $$
declare v_h uuid := gen_random_uuid(); v_r uuid;
begin
  insert into auth.users (id, email) values (v_h, 'declchk@example.test');
  insert into profiles (id, role, full_name, approved, active, email)
    values (v_h, 'hospital', 'DECLCHK', true, true, 'declchk@example.test')
    on conflict (id) do update set role = 'hospital';

  insert into patient_referrals (hospital_id, patient_name, medical_issue, status)
    values (v_h, 'DECLCHK patient', 'knee', 'pending_review')
    returning id into v_r;

  -- A short reason is refused.
  begin
    update patient_referrals set status = 'declined', decline_reason = 'no' where id = v_r;
    raise exception 'DECLINE REASON failed: a two-character reason was accepted';
  exception when check_violation then
    null; -- expected
  end;

  -- A real one lands.
  update patient_referrals
     set status = 'declined', decline_reason = 'Neurological case, we only take orthopaedic referrals.'
   where id = v_r;
  if (select decline_reason from patient_referrals where id = v_r) is null then
    raise exception 'DECLINE REASON failed: a valid reason did not write';
  end if;

  raise notice 'Decline reason checks passed.';
end $$;

-- ---------------------------------------------------------------------------
-- The frozen revenue-split rates stay inside 0-100
-- ---------------------------------------------------------------------------
do $$
declare v_p uuid := gen_random_uuid(); v_a uuid;
begin
  insert into auth.users (id, email) values (v_p, 'ratechk@example.test');
  insert into profiles (id, role, full_name, approved, active, email)
    values (v_p, 'patient', 'RATECHK', true, true, 'ratechk@example.test')
    on conflict (id) do update set role = 'patient';
  insert into appointments (patient_id, status) values (v_p, 'requested') returning id into v_a;

  -- Null is always allowed: a session completed before these columns
  -- existed has no recorded rate, and inventing one is the fabrication the
  -- column exists to prevent.
  update appointments set therapist_share_percent_at_completion = null where id = v_a;

  begin
    update appointments set therapist_share_percent_at_completion = 120 where id = v_a;
    raise exception 'SHARE RANGE failed: 120%% was accepted';
  exception when check_violation then
    null; -- expected
  end;

  begin
    update appointments set hospital_share_percent_at_completion = -5 where id = v_a;
    raise exception 'SHARE RANGE failed: -5%% was accepted';
  exception when check_violation then
    null; -- expected
  end;

  -- A recorded 0 is a real rate, not an absence, and must be storable.
  update appointments set therapist_share_percent_at_completion = 0 where id = v_a;

  raise notice 'Settlement rate range checks passed.';
end $$;

rollback;

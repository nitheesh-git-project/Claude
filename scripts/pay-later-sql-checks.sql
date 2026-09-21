-- Pay later's storage-layer checks.
--
-- What the routes cannot produce and the unit tests cannot see: how a
-- discount claim behaves on a booking that will never capture. A pay-later
-- session sits at payment_status = 'unpaid' for its whole life, and both
-- claim functions used to count a claim as spent only while the booking was
-- paid or inside a thirty-minute checkout hold -- so thirty minutes after
-- booking a promo claim silently stopped counting against its cap while the
-- discount stayed frozen into what the patient owed.
--
-- And the same shape one layer up, in eligibility rather than in a cap: a
-- patient is new exactly once, and every reader of that question asked
-- `payment_status = 'paid'` -- so a patient treated on terms read as brand
-- new on every booking they ever made, collecting the first-session offer
-- and an invite welcome again each time.
--
-- Every assertion here checks BOTH halves, per the rule the append-only
-- checks established: that the pay-later booking still counts, AND that an
-- ordinary abandoned checkout still gives its claim back -- and that a
-- CANCELLED booking on terms still leaves the patient new. Checking only the
-- first would pass just as well on a function that had broken the hold for
-- everybody, or one that counted a session nobody ever had.
--
-- Runs inside one transaction and ends in ROLLBACK, so it leaves nothing
-- behind and can be re-run against the same database.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/pay-later-sql-checks.sql
--
-- A negative control was run before this file was trusted: one assertion was
-- inverted and the run had to fail. A green run means nothing otherwise.

begin;

do $$
declare
  v_patient uuid;
  v_other_patient uuid;
  v_category uuid;
  v_promo uuid;
  v_appt_terms uuid;
  v_appt_abandoned uuid;
  v_appt_probe uuid;
  v_appt_writeoff uuid;
  v_sess_old uuid;
  v_sess_new uuid;
  v_payment uuid;
  v_pending uuid;
  v_status text;
  v_amount integer;
  v_confirmed integer;
  v_settled integer;
  v_unallocated integer;
  v_result jsonb;
begin
  -- ---------------------------------------------------------------------
  -- Fixtures. Built here rather than found, so a database with no promo
  -- campaign does not skip the whole file silently.
  -- ---------------------------------------------------------------------
  select id into v_patient from profiles where role = 'patient' limit 1;
  select id into v_other_patient from profiles where role = 'patient' and id <> v_patient limit 1;
  select id into v_category from treatment_categories limit 1;
  if v_patient is null or v_other_patient is null or v_category is null then
    raise exception 'Needs two patients and one treatment category to run against';
  end if;

  insert into promo_codes (code, kind, value, active, max_redemptions, max_per_patient)
    values ('PAYLATERCHECK', 'amount_off', 10000, true, 1, 1)
    returning id into v_promo;

  -- A booking confirmed on terms, claimed well outside the checkout hold.
  insert into appointments (patient_id, category_id, slot_time, status, payment_status,
                            payment_terms, amount_due_paise, promo_code_id, promo_claimed_at)
    values (v_patient, v_category, now() + interval '2 days', 'confirmed', 'unpaid',
            'pay_later', 120000, v_promo, now() - interval '3 hours')
    returning id into v_appt_terms;

  -- An ordinary prepaid checkout somebody walked away from, same age.
  insert into appointments (patient_id, category_id, slot_time, status, payment_status,
                            payment_terms, promo_code_id, promo_claimed_at)
    values (v_other_patient, v_category, now() + interval '2 days', 'requested', 'unpaid',
            'prepaid', v_promo, now() - interval '3 hours')
    returning id into v_appt_abandoned;

  -- The booking that will try to claim the same code.
  insert into appointments (patient_id, category_id, slot_time, status, payment_status)
    values (v_other_patient, v_category, now() + interval '3 days', 'requested', 'unpaid')
    returning id into v_appt_probe;

  -- ---------------------------------------------------------------------
  -- 1. A pay-later booking's claim still counts against the cap, hours
  --    later. This is the bug: without it the cap of 1 reads as unused.
  -- ---------------------------------------------------------------------
  v_result := claim_promo_code('PAYLATERCHECK', v_other_patient, v_appt_probe, false);
  if coalesce(v_result->>'reason', '') <> 'exhausted' then
    raise exception
      'A pay-later booking stopped counting against the cap: got %', v_result;
  end if;

  -- ---------------------------------------------------------------------
  -- 2. The other half: an ABANDONED prepaid checkout of the same age still
  --    gives its claim back. Without this assertion, a function that simply
  --    counted every claim forever would pass check 1 while breaking the
  --    hold for everybody.
  -- ---------------------------------------------------------------------
  update appointments set payment_terms = 'prepaid', amount_due_paise = null
    where id = v_appt_terms;

  v_result := claim_promo_code('PAYLATERCHECK', v_other_patient, v_appt_probe, false);
  if coalesce(v_result->>'ok', 'false') <> 'true' then
    raise exception
      'Two abandoned checkouts should have released the cap, but the claim was refused: %',
      v_result;
  end if;

  -- ---------------------------------------------------------------------
  -- 3. A paid booking counts, exactly as it always did -- the behaviour the
  --    pay-later clause is modelled on, asserted so a change to one cannot
  --    silently change the other.
  -- ---------------------------------------------------------------------
  update appointments set promo_code_id = null, promo_claimed_at = null where id = v_appt_probe;
  update appointments set payment_status = 'paid', promo_claimed_at = now() - interval '3 hours'
    where id = v_appt_terms;

  v_result := claim_promo_code('PAYLATERCHECK', v_other_patient, v_appt_probe, false);
  if coalesce(v_result->>'reason', '') <> 'exhausted' then
    raise exception 'A paid booking stopped counting against the cap: got %', v_result;
  end if;

  -- ---------------------------------------------------------------------
  -- 4. A patient is new exactly once, and a booking on terms is what makes
  --    them no longer new. Until this, claim_invite asked
  --    `payment_status = 'paid'` -- which a pay-later session never is -- so
  --    a patient who had already been treated could still claim a welcome.
  -- ---------------------------------------------------------------------
  update site_settings set invite_rewards_enabled = true,
                           invite_max_rewards_per_patient = 10,
                           invite_welcome_paise = 20000,
                           invite_reward_paise = 20000
    where id;

  -- The inviter needs a code to be found by, and the invitee must not
  -- already hold an invite from an earlier run of this file.
  update profiles set invite_code = 'PAYLATERINV' where id = v_patient;
  delete from patient_invites where invitee_id = v_other_patient;

  -- A standing booking on terms, and nothing paid.
  update appointments set payment_status = 'unpaid', payment_terms = 'pay_later',
                          status = 'confirmed', amount_due_paise = 120000
    where id = v_appt_terms;
  update appointments set payment_status = 'unpaid', payment_terms = 'prepaid'
    where id in (v_appt_abandoned, v_appt_probe);
  update appointments set patient_id = v_other_patient where id = v_appt_terms;

  v_result := claim_invite('PAYLATERINV', v_other_patient);
  if coalesce(v_result->>'reason', '') <> 'not_new' then
    raise exception
      'A patient with a confirmed pay-later session still read as new: got %', v_result;
  end if;

  -- ---------------------------------------------------------------------
  -- 5. The other half, and the one that stops the fix going too far: a
  --    CANCELLED pay-later booking was never delivered and owes nothing, so
  --    it must not spend a once-ever welcome. Without this assertion, a
  --    predicate counting every booking on terms would pass check 4.
  -- ---------------------------------------------------------------------
  update appointments set status = 'cancelled' where id = v_appt_terms;

  v_result := claim_invite('PAYLATERINV', v_other_patient);
  if coalesce(v_result->>'ok', 'false') <> 'true' then
    raise exception
      'A cancelled pay-later booking should have left the patient new: got %', v_result;
  end if;

  -- ---------------------------------------------------------------------
  -- 6. And the arm that was always there: a PAID session still makes a
  --    patient not new, whatever its status. The paid arm deliberately does
  --    not take the cancelled exclusion -- widening it would hand the
  --    welcome back to everybody who ever paid and then cancelled.
  -- ---------------------------------------------------------------------
  delete from patient_invites where invitee_id = v_other_patient;
  update appointments set payment_terms = 'prepaid', payment_status = 'paid',
                          status = 'cancelled'
    where id = v_appt_terms;

  v_result := claim_invite('PAYLATERINV', v_other_patient);
  if coalesce(v_result->>'reason', '') <> 'not_new' then
    raise exception
      'A paid session stopped making a patient not-new: got %', v_result;
  end if;

  -- ---------------------------------------------------------------------
  -- 7. The settlement pool. Whole sessions only, oldest first, and the
  --    amount written is the session's own frozen price -- never the
  --    payment's share of it. That last part is the whole safety case:
  --    the therapist's cut is computed from amount_paid_paise, so
  --    spreading 2,000 across four 1,200 sessions would shrink it on
  --    sessions the clinic had already paid out on.
  -- ---------------------------------------------------------------------
  insert into appointments (patient_id, category_id, slot_time, status, payment_status,
                            payment_terms, amount_due_paise)
    values (v_patient, v_category, now() - interval '20 days', 'completed', 'unpaid',
            'pay_later', 120000)
    returning id into v_sess_old;
  insert into appointments (patient_id, category_id, slot_time, status, payment_status,
                            payment_terms, amount_due_paise)
    values (v_patient, v_category, now() - interval '10 days', 'completed', 'unpaid',
            'pay_later', 120000)
    returning id into v_sess_new;

  insert into pay_later_payments (patient_id, amount_paise, method, status,
                                  confirmed_at, unallocated_paise)
    values (v_patient, 200000, 'upi', 'confirmed', now(), 200000)
    returning id into v_payment;

  v_result := allocate_pay_later_payment(v_patient);

  if coalesce((v_result->>'settled_count')::int, -1) <> 1 then
    raise exception 'A 2,000 payment should settle exactly one 1,200 session: got %', v_result;
  end if;
  if coalesce((v_result->>'unallocated_paise')::int, -1) <> 80000 then
    raise exception 'The 800 remainder should stay in the pool: got %', v_result;
  end if;

  -- Oldest first, and the amount is the session's own price.
  select payment_status, amount_paid_paise into v_status, v_amount
    from appointments where id = v_sess_old;
  if v_status <> 'paid' or v_amount <> 120000 then
    raise exception
      'The oldest session should be settled at its own frozen price: status %, amount %',
      v_status, v_amount;
  end if;

  -- The other half: the newer session is NOT part-settled. 800 covers none
  -- of it, and writing 800 onto it would move the therapist's cut.
  select payment_status, amount_paid_paise into v_status, v_amount
    from appointments where id = v_sess_new;
  if v_status = 'paid' or coalesce(v_amount, 0) <> 0 then
    raise exception
      'A session must never be part-settled: status %, amount %', v_status, v_amount;
  end if;

  -- ---------------------------------------------------------------------
  -- 8. Idempotent. Allocation runs at two moments -- a payment confirmed
  --    and a session completed -- so a second call must find nothing left
  --    to cover rather than settling the same session twice.
  -- ---------------------------------------------------------------------
  v_result := allocate_pay_later_payment(v_patient);
  if coalesce((v_result->>'settled_count')::int, -1) <> 0 then
    raise exception 'A second allocation settled something again: %', v_result;
  end if;

  -- ---------------------------------------------------------------------
  -- 9. A further 400 tops the pool to 1,200 and the next session closes.
  -- ---------------------------------------------------------------------
  insert into pay_later_payments (patient_id, amount_paise, method, status,
                                  confirmed_at, unallocated_paise)
    values (v_patient, 40000, 'cash', 'confirmed', now(), 40000);

  v_result := allocate_pay_later_payment(v_patient);
  if coalesce((v_result->>'settled_count')::int, -1) <> 1 then
    raise exception 'Topping the pool to 1,200 should settle the next session: %', v_result;
  end if;

  -- ---------------------------------------------------------------------
  -- 10. money in = money on sessions + money still in the pool. The one
  --     invariant the pool design stands on, and the System Health check's
  --     only red state.
  -- ---------------------------------------------------------------------
  select coalesce(sum(amount_paise), 0), coalesce(sum(unallocated_paise), 0)
    into v_confirmed, v_unallocated
    from pay_later_payments where patient_id = v_patient and status = 'confirmed';
  select coalesce(sum(amount_paid_paise), 0) into v_settled
    from appointments where pay_later_payment_id is not null and patient_id = v_patient;
  if v_confirmed <> v_settled + v_unallocated then
    raise exception
      'Money in (%) should equal money on sessions (%) plus the pool (%)',
      v_confirmed, v_settled, v_unallocated;
  end if;

  -- ---------------------------------------------------------------------
  -- 11. The append-only guard, both halves: the one transition it needs
  --     still lands, and every other one raises.
  -- ---------------------------------------------------------------------
  insert into pay_later_payments (patient_id, amount_paise, method, status)
    values (v_patient, 50000, 'bank_transfer', 'pending')
    returning id into v_pending;

  update pay_later_payments set status = 'confirmed', confirmed_at = now()
    where id = v_pending;  -- must succeed

  begin
    update pay_later_payments set status = 'pending' where id = v_pending;
    raise exception 'A confirmed payment was allowed back to pending';
  exception when others then
    if sqlerrm like '%was allowed back to pending%' then raise; end if;
  end;

  begin
    delete from pay_later_payments where id = v_pending;
    raise exception 'A payment was deleted';
  exception when others then
    if sqlerrm like '%was deleted%' then raise; end if;
  end;

  begin
    update pay_later_payments set amount_paise = 1 where id = v_pending;
    raise exception 'A declared amount was rewritten';
  exception when others then
    if sqlerrm like '%was rewritten%' then raise; end if;
  end;

  -- ---------------------------------------------------------------------
  -- 12. The two CHECKs: an online row is never pending, and a rejection
  --     carries a real reason.
  -- ---------------------------------------------------------------------
  begin
    insert into pay_later_payments (patient_id, amount_paise, method, status)
      values (v_patient, 10000, 'online', 'pending');
    raise exception 'An online payment was allowed to sit pending';
  exception when others then
    if sqlerrm like '%allowed to sit pending%' then raise; end if;
  end;

  insert into pay_later_payments (patient_id, amount_paise, method, status)
    values (v_patient, 10000, 'upi', 'pending')
    returning id into v_pending;
  begin
    update pay_later_payments set status = 'rejected', rejection_reason = 'too short'
      where id = v_pending;
    raise exception 'A nine-character rejection reason was accepted';
  exception when others then
    if sqlerrm like '%nine-character%' then raise; end if;
  end;

  update pay_later_payments
    set status = 'rejected', rejection_reason = 'Nothing matching that reference reached the account'
    where id = v_pending;  -- must succeed

  -- ---------------------------------------------------------------------
  -- 13. A capture against a settlement order confirms the payment and
  --     closes the sessions it covers, inside one transaction.
  --
  --     This one caught a real bug. The branch originally claimed the row
  --     on `status = 'pending'` -- and an online row is created `confirmed`,
  --     because the CHECK above refuses a pending one, so the guard could
  --     never match and the allocator never ran on the single path it was
  --     written for. Everything looked right: the purpose was set, the
  --     target attached, the payment recorded. Only the session stayed open.
  -- ---------------------------------------------------------------------
  insert into appointments (patient_id, category_id, slot_time, status, payment_status,
                            payment_terms, amount_due_paise)
    values (v_other_patient, v_category, now() - interval '5 days', 'completed', 'unpaid',
            'pay_later', 120000)
    returning id into v_sess_old;

  insert into pay_later_payments (patient_id, amount_paise, method, status,
                                  razorpay_order_id, unallocated_paise)
    values (v_other_patient, 120000, 'online', 'confirmed', 'order_PLCHECK', 0)
    returning id into v_payment;

  -- No payments row yet: the webhook-first case, where the capture has to
  -- work out for itself what the order was for.
  v_result := record_payment_capture('order_PLCHECK', 'pay_PLCHECK', 120000, null);

  select purpose into v_status from payments where razorpay_order_id = 'order_PLCHECK';
  if v_status <> 'pay_later_settlement' then
    raise exception 'A settlement capture was recorded as %', v_status;
  end if;

  select payment_status into v_status from appointments where id = v_sess_old;
  if v_status <> 'paid' then
    raise exception
      'The capture confirmed the payment and did not close the session: %', v_status;
  end if;

  -- ---------------------------------------------------------------------
  -- 14. The other half: a retried webhook settles nothing a second time.
  --     Razorpay retries at least once, and a duplicate that allocated
  --     again would hand the patient their money twice.
  -- ---------------------------------------------------------------------
  v_result := record_payment_capture('order_PLCHECK', 'pay_PLCHECK', 120000, null);
  if coalesce((v_result->>'already_captured')::boolean, false) <> true then
    raise exception 'A duplicate capture was not recognised: %', v_result;
  end if;
  select count(*) into v_amount from appointments where pay_later_payment_id = v_payment;
  if v_amount <> 1 then
    raise exception 'A duplicate capture settled % sessions', v_amount;
  end if;

  -- ---------------------------------------------------------------------
  -- 15. Writing a session off: one cost row per session, and no second.
  --     The route claims the appointment first and only the winner writes
  --     the loss -- but that route check is true for exactly as long as
  --     every caller remembers it, and this table is reachable by the
  --     service-role key and by hand in the SQL editor. The index is what
  --     makes it true anyway.
  -- ---------------------------------------------------------------------
  insert into appointments (patient_id, category_id, slot_time, status,
                            payment_status, payment_terms, amount_due_paise,
                            concern, duration_minutes)
    values (v_patient, v_category, now() - interval '20 days', 'completed',
            'unpaid', 'pay_later', 150000, 'Write-off check', 45)
    returning id into v_appt_writeoff;

  update appointments set pay_later_outcome = 'written_off' where id = v_appt_writeoff;

  insert into business_expenses (incurred_on, category, description, amount_paise,
                                 source_appointment_id)
    values (current_date, 'Bad debt', 'Written off: check', 150000, v_appt_writeoff);

  -- The half that matters: a second row for the same session is refused.
  -- Without it a double tap records the loss twice and understates profit by
  -- the amount forgiven, in the books, silently.
  begin
    insert into business_expenses (incurred_on, category, description, amount_paise,
                                   source_appointment_id)
      values (current_date, 'Bad debt', 'Written off: duplicate', 150000, v_appt_writeoff);
    raise exception 'A second bad-debt row was accepted for one session';
  exception
    when unique_violation then null;
  end;

  -- And the other half of THAT: ordinary hand-entered costs are unaffected.
  -- Two rents in one month is not a duplicate, and an index that refused
  -- them would have broken the Costs screen to protect a feature nobody had
  -- used yet.
  --
  -- Stated honestly: this pair cannot fail while the column is nullable,
  -- because Postgres treats NULLs in a unique index as distinct whether the
  -- index is partial or not -- a negative control confirmed a non-partial
  -- index passes it too. It is here as the documented half of the rule, not
  -- as the thing that proves it; the `where source_appointment_id is not
  -- null` clause is belt-and-braces over that default, and the assertion
  -- above is what actually discriminates.
  insert into business_expenses (incurred_on, category, amount_paise)
    values (current_date, 'Rent', 5000000);
  insert into business_expenses (incurred_on, category, amount_paise)
    values (current_date, 'Rent', 5000000);

  -- ---------------------------------------------------------------------
  -- 16. A written-off session is skipped by allocation, and an ordinary one
  --     is not. Both halves, because a function that skipped everything
  --     would pass the first on its own -- and money arriving against a
  --     forgiven session has to stay in the pool rather than closing it.
  -- ---------------------------------------------------------------------
  insert into appointments (patient_id, category_id, slot_time, status,
                            payment_status, payment_terms, amount_due_paise,
                            concern, duration_minutes)
    values (v_patient, v_category, now() - interval '10 days', 'completed',
            'unpaid', 'pay_later', 100000, 'Still owed', 45)
    returning id into v_appt_probe;

  insert into pay_later_payments (patient_id, amount_paise, method, status, unallocated_paise)
    values (v_patient, 100000, 'cash', 'confirmed', 100000)
    returning id into v_payment;

  perform allocate_pay_later_payment(v_patient);

  select payment_status into v_status from appointments where id = v_appt_writeoff;
  if v_status <> 'unpaid' then
    raise exception 'A written-off session was settled by the allocator: %', v_status;
  end if;

  select payment_status into v_status from appointments where id = v_appt_probe;
  if v_status <> 'paid' then
    raise exception
      'The allocator skipped an ordinary owed session as well: %', v_status;
  end if;

  -- The written-off session is older, so an allocator that merely stopped at
  -- the first row it could not cover would also pass above. It has to have
  -- passed OVER it to reach the newer one.
  select amount_paid_paise into v_amount from appointments where id = v_appt_probe;
  if v_amount <> 100000 then
    raise exception 'A settled session recorded % rather than its own amount', v_amount;
  end if;

  raise notice 'pay-later SQL checks passed';
end $$;

rollback;

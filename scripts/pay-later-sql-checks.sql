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
    values ('PAYLATERCHECK', 'fixed', 10000, true, 1, 1)
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

  raise notice 'pay-later SQL checks passed';
end $$;

rollback;

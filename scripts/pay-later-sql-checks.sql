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
-- Every assertion here checks BOTH halves, per the rule the append-only
-- checks established: that the pay-later booking still counts, AND that an
-- ordinary abandoned checkout still gives its claim back. Checking only the
-- first would pass just as well on a function that had broken the hold for
-- everybody.
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

  raise notice 'pay-later SQL checks passed';
end $$;

rollback;

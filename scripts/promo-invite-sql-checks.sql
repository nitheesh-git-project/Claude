-- Storage-layer checks for promo codes and invites.
--
-- The rules these two features rest on are enforced in the database rather
-- than in a route, because both give money away and both are reachable by a
-- session cookie posting straight at the API. This file asserts the ones the
-- routes cannot produce a counter-example for: a redemption cap under a
-- second claim, a window whose end is exclusive, a patient claiming their own
-- invite code, a second invite for one patient, and a reward that only exists
-- once the friend has paid.
--
-- Runs inside one transaction and ends in ROLLBACK, so it leaves nothing
-- behind and can be re-run against the same database:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/promo-invite-sql-checks.sql
--
-- Applying supabase/schema.sql twice against a scratch Postgres and then
-- running this is what a schema change to these tables should be verified
-- with.

begin;

do $$
declare
  v_inviter uuid := gen_random_uuid();
  v_invitee uuid := gen_random_uuid();
  v_other   uuid := gen_random_uuid();
  v_promo   uuid;
  v_appt_a  uuid := gen_random_uuid();
  v_appt_b  uuid := gen_random_uuid();
  v_appt_c  uuid := gen_random_uuid();
  v_appt_d  uuid := gen_random_uuid();
  v_result  jsonb;
  v_ok      boolean;
begin
  insert into auth.users (id, email) values
    (v_inviter, 'checks.inviter@example.test'),
    (v_invitee, 'checks.invitee@example.test'),
    (v_other,   'checks.other@example.test');
  -- handle_new_user already inserted a patient profile for each of those,
  -- so these are updates. Inserting again is the mistake that makes this
  -- file look broken against a real Supabase project.
  update profiles set role = 'patient', invite_code = 'ABCD2345' where id = v_inviter;
  update profiles set role = 'patient' where id in (v_invitee, v_other);

  insert into site_settings (id) values (true) on conflict (id) do nothing;
  update site_settings set
    invite_rewards_enabled = true,
    invite_reward_paise = 20000,
    invite_welcome_paise = 30000,
    invite_max_rewards_per_patient = 10
  where id;

  -- =====================================================================
  -- PROMO-1  A code is stored in one spelling only.
  -- =====================================================================
  begin
    insert into promo_codes (code, kind, value) values ('welcome200', 'amount_off', 20000);
    raise exception 'PROMO-1 FAILED: a lower-case code was stored';
  exception when check_violation then null;
  end;

  begin
    insert into promo_codes (code, kind, value) values ('WEL-COME', 'amount_off', 20000);
    raise exception 'PROMO-1 FAILED: a code with punctuation was stored';
  exception when check_violation then null;
  end;

  -- =====================================================================
  -- PROMO-2  A percentage is a percentage.
  -- =====================================================================
  begin
    insert into promo_codes (code, kind, value) values ('HALFOFF', 'percent_off', 150);
    raise exception 'PROMO-2 FAILED: a 150%% code was stored';
  exception when check_violation then null;
  end;

  -- =====================================================================
  -- PROMO-3  A window that ends before it starts is not a window.
  -- =====================================================================
  begin
    insert into promo_codes (code, kind, value, starts_at, ends_at)
      values ('BACKWARD', 'amount_off', 1000, now(), now() - interval '1 day');
    raise exception 'PROMO-3 FAILED: a backwards window was stored';
  exception when check_violation then null;
  end;

  insert into promo_codes (code, kind, value, max_redemptions, max_per_patient)
    values ('CAPONE', 'amount_off', 20000, 1, 1)
    returning id into v_promo;

  insert into appointments (id, patient_id, status, payment_status)
    values (v_appt_a, v_invitee, 'requested', 'unpaid'),
           (v_appt_b, v_other,   'requested', 'unpaid'),
           (v_appt_c, v_invitee, 'requested', 'unpaid'),
           (v_appt_d, v_other,   'requested', 'unpaid');

  -- =====================================================================
  -- PROMO-4  The first claim wins; the second is told the code is gone.
  -- =====================================================================
  v_result := claim_promo_code('CAPONE', v_invitee, v_appt_a, false);
  if not (v_result->>'ok')::boolean then
    raise exception 'PROMO-4 FAILED: the first claim was refused (%)', v_result->>'reason';
  end if;

  v_result := claim_promo_code('CAPONE', v_other, v_appt_b, false);
  if (v_result->>'ok')::boolean then
    raise exception 'PROMO-4 FAILED: a code capped at 1 was claimed twice';
  end if;
  if v_result->>'reason' <> 'exhausted' then
    raise exception 'PROMO-4 FAILED: expected exhausted, got %', v_result->>'reason';
  end if;

  -- =====================================================================
  -- PROMO-5  An abandoned checkout gives the claim back.
  -- =====================================================================
  -- Nothing writes an "expired" status; the hold simply stops counting.
  update appointments set promo_claimed_at = now() - interval '2 hours' where id = v_appt_a;
  v_result := claim_promo_code('CAPONE', v_other, v_appt_b, false);
  if not (v_result->>'ok')::boolean then
    raise exception 'PROMO-5 FAILED: a stale hold still counted against the cap (%)',
      v_result->>'reason';
  end if;

  -- ...but a paid one never does.
  update appointments set payment_status = 'paid' where id = v_appt_a;
  update appointments set promo_code_id = null, promo_claimed_at = null where id = v_appt_b;
  v_result := claim_promo_code('CAPONE', v_other, v_appt_b, false);
  if (v_result->>'ok')::boolean then
    raise exception 'PROMO-5 FAILED: a paid redemption stopped counting against the cap';
  end if;

  -- =====================================================================
  -- PROMO-6  Re-opening checkout on the same booking is not a second claim.
  -- =====================================================================
  update appointments set payment_status = 'unpaid', promo_claimed_at = now() where id = v_appt_a;
  v_result := claim_promo_code('CAPONE', v_invitee, v_appt_a, false);
  if not (v_result->>'ok')::boolean then
    raise exception 'PROMO-6 FAILED: re-opening checkout was counted as a second claim (%)',
      v_result->>'reason';
  end if;

  -- =====================================================================
  -- PROMO-7  A per-patient cap is per patient.
  -- =====================================================================
  -- On its own code, deliberately: the total cap is checked first, so
  -- re-using CAPONE here would prove "exhausted" rather than the per-patient
  -- rule this is about.
  insert into promo_codes (code, kind, value, max_per_patient)
    values ('ONEEACH', 'amount_off', 20000, 1);
  v_result := claim_promo_code('ONEEACH', v_other, v_appt_b, false);
  if not (v_result->>'ok')::boolean then
    raise exception 'PROMO-7 FAILED: the first claim was refused (%)', v_result->>'reason';
  end if;
  v_result := claim_promo_code('ONEEACH', v_other, v_appt_d, false);
  if (v_result->>'ok')::boolean then
    raise exception 'PROMO-7 FAILED: one patient claimed a once-per-patient code twice';
  end if;
  if v_result->>'reason' <> 'already_used' then
    raise exception 'PROMO-7 FAILED: expected already_used, got %', v_result->>'reason';
  end if;

  -- ...and it is per patient, not global: somebody else may still claim it.
  v_result := claim_promo_code('ONEEACH', v_invitee, v_appt_c, false);
  if not (v_result->>'ok')::boolean then
    raise exception 'PROMO-7 FAILED: a per-patient cap blocked a different patient (%)',
      v_result->>'reason';
  end if;

  -- =====================================================================
  -- PROMO-8  The end of a window is exclusive.
  -- =====================================================================
  insert into promo_codes (code, kind, value, ends_at)
    values ('ENDEDNOW', 'amount_off', 1000, now());
  v_result := claim_promo_code('ENDEDNOW', v_other, v_appt_b, false);
  if v_result->>'reason' <> 'expired' then
    raise exception 'PROMO-8 FAILED: a code ending now was still claimable (%)', v_result;
  end if;

  -- =====================================================================
  -- PROMO-9  A settled booking cannot have a code stamped onto it.
  -- =====================================================================
  insert into promo_codes (code, kind, value) values ('OPENCODE', 'amount_off', 1000);
  update appointments set payment_status = 'paid', promo_code_id = null where id = v_appt_c;
  v_result := claim_promo_code('OPENCODE', v_invitee, v_appt_c, false);
  if (v_result->>'ok')::boolean then
    raise exception 'PROMO-9 FAILED: a code was claimed onto a paid booking';
  end if;
  update appointments set payment_status = 'unpaid' where id = v_appt_c;

  -- =====================================================================
  -- PROMO-10  Only the five known discount sources may be recorded.
  -- =====================================================================
  begin
    update appointments set discount_source = 'mates_rates' where id = v_appt_c;
    raise exception 'PROMO-10 FAILED: an unknown discount source was stored';
  exception when check_violation then null;
  end;
  update appointments set discount_source = 'promo_code', discount_paise = 1
    where id = v_appt_c;
  update appointments set discount_source = 'invite_welcome' where id = v_appt_c;
  update appointments set discount_source = null, discount_paise = 0 where id = v_appt_c;

  -- =====================================================================
  -- INVITE-1  A patient cannot claim their own code.
  -- =====================================================================
  v_result := claim_invite('ABCD2345', v_inviter);
  if (v_result->>'ok')::boolean then
    raise exception 'INVITE-1 FAILED: a patient claimed their own invite code';
  end if;
  if v_result->>'reason' <> 'self' then
    raise exception 'INVITE-1 FAILED: expected self, got %', v_result->>'reason';
  end if;

  -- The constraint holds it too, not only the function.
  begin
    insert into patient_invites (inviter_id, invitee_id, code_used)
      values (v_inviter, v_inviter, 'ABCD2345');
    raise exception 'INVITE-1 FAILED: a self-invite row was stored';
  exception when check_violation then null;
  end;

  -- =====================================================================
  -- INVITE-2  A code is read however it was typed.
  -- =====================================================================
  v_result := claim_invite(' abcd-2345 ', v_invitee);
  if not (v_result->>'ok')::boolean then
    raise exception 'INVITE-2 FAILED: a code typed with a hyphen was not recognised (%)',
      v_result->>'reason';
  end if;
  if (v_result->>'welcome_paise')::integer <> 30000 then
    raise exception 'INVITE-2 FAILED: the welcome was not snapshotted from settings';
  end if;

  -- =====================================================================
  -- INVITE-3  One invite per patient, ever.
  -- =====================================================================
  v_result := claim_invite('ABCD2345', v_invitee);
  if (v_result->>'ok')::boolean then
    raise exception 'INVITE-3 FAILED: a patient claimed a second invite';
  end if;
  begin
    insert into patient_invites (inviter_id, invitee_id, code_used)
      values (v_other, v_invitee, 'ABCD2345');
    raise exception 'INVITE-3 FAILED: a second invite row was stored for one patient';
  exception when unique_violation then null;
  end;

  -- =====================================================================
  -- INVITE-4  A patient is new exactly once.
  -- =====================================================================
  update appointments set payment_status = 'paid' where id = v_appt_b; -- v_other has paid
  v_result := claim_invite('ABCD2345', v_other);
  if (v_result->>'ok')::boolean then
    raise exception 'INVITE-4 FAILED: an established patient claimed a welcome';
  end if;
  if v_result->>'reason' <> 'not_new' then
    raise exception 'INVITE-4 FAILED: expected not_new, got %', v_result->>'reason';
  end if;
  update appointments set payment_status = 'unpaid' where id = v_appt_b;

  -- =====================================================================
  -- INVITE-5  The reward does not exist until the friend has paid.
  -- =====================================================================
  v_result := claim_invite_half(v_inviter, v_appt_b, 'reward');
  if (v_result->>'ok')::boolean then
    raise exception 'INVITE-5 FAILED: a reward was spent before the friend paid';
  end if;

  -- The welcome, by contrast, is available straight away -- it is the half
  -- doing the persuading.
  v_result := claim_invite_half(v_invitee, v_appt_c, 'welcome');
  if not (v_result->>'ok')::boolean then
    raise exception 'INVITE-5 FAILED: the welcome was not available (%)', v_result->>'reason';
  end if;
  if (v_result->>'amount_paise')::integer <> 30000 then
    raise exception 'INVITE-5 FAILED: the welcome paid out the wrong amount';
  end if;

  -- =====================================================================
  -- INVITE-6  Granting is idempotent -- the callback and the webhook race.
  -- =====================================================================
  v_result := grant_invite_reward(v_invitee, v_appt_c);
  if not (v_result->>'ok')::boolean or (v_result->>'already')::boolean then
    raise exception 'INVITE-6 FAILED: the first grant did not take (%)', v_result;
  end if;
  v_result := grant_invite_reward(v_invitee, v_appt_c);
  if not (v_result->>'already')::boolean then
    raise exception 'INVITE-6 FAILED: a second grant was treated as new';
  end if;
  if (select count(*) from patient_invites where invitee_id = v_invitee and qualified_at is not null) <> 1 then
    raise exception 'INVITE-6 FAILED: two rewards were granted for one invite';
  end if;

  -- =====================================================================
  -- INVITE-7  A half is spent once, and a second checkout does not hold it.
  -- =====================================================================
  v_result := claim_invite_half(v_inviter, v_appt_b, 'reward');
  if not (v_result->>'ok')::boolean then
    raise exception 'INVITE-7 FAILED: the reward was not available after qualifying (%)',
      v_result->>'reason';
  end if;

  -- A second booking opened while the first is still inside its checkout
  -- window is refused: without this, both orders are minted at the
  -- discounted amount and paying both spends one reward twice.
  v_result := claim_invite_half(v_inviter, v_appt_a, 'reward');
  if (v_result->>'ok')::boolean then
    raise exception 'INVITE-7 FAILED: one reward was held by two open checkouts';
  end if;
  if v_result->>'reason' <> 'held' then
    raise exception 'INVITE-7 FAILED: expected held, got %', v_result->>'reason';
  end if;

  -- Once the first booking is abandoned, the reward comes back.
  update appointments set promo_claimed_at = now() - interval '2 hours' where id = v_appt_b;
  v_result := claim_invite_half(v_inviter, v_appt_a, 'reward');
  if not (v_result->>'ok')::boolean then
    raise exception 'INVITE-7 FAILED: an abandoned checkout kept the reward (%)',
      v_result->>'reason';
  end if;

  -- =====================================================================
  -- INVITE-8  Settling is idempotent and final.
  -- =====================================================================
  v_ok := settle_invite_half(v_appt_a, 'reward');
  if not v_ok then
    raise exception 'INVITE-8 FAILED: the reward would not settle';
  end if;
  if settle_invite_half(v_appt_a, 'reward') then
    raise exception 'INVITE-8 FAILED: a settled reward settled a second time';
  end if;
  v_result := claim_invite_half(v_inviter, v_appt_b, 'reward');
  if (v_result->>'ok')::boolean then
    raise exception 'INVITE-8 FAILED: a settled reward was spent again';
  end if;
  if v_result->>'reason' <> 'spent' then
    raise exception 'INVITE-8 FAILED: expected spent, got %', v_result->>'reason';
  end if;

  -- =====================================================================
  -- INVITE-9  With invites switched off, nothing can be claimed.
  -- =====================================================================
  update site_settings set invite_rewards_enabled = false where id;
  v_result := claim_invite('ABCD2345', v_other);
  if (v_result->>'ok')::boolean or v_result->>'reason' <> 'disabled' then
    raise exception 'INVITE-9 FAILED: an invite was claimed while the feature was off (%)',
      v_result;
  end if;

  -- =====================================================================
  -- INVITE-10  An invite code belongs to one patient.
  -- =====================================================================
  begin
    update profiles set invite_code = 'ABCD2345' where id = v_other;
    raise exception 'INVITE-10 FAILED: two patients shared one invite code';
  exception when unique_violation then null;
  end;

  -- ensure_invite_code is idempotent, and hands a collision back rather
  -- than failing the render that happened to need a code.
  if ensure_invite_code(v_inviter, 'ZZZZ9999') <> 'ABCD2345' then
    raise exception 'INVITE-10 FAILED: an existing code was overwritten';
  end if;
  if ensure_invite_code(v_other, 'ABCD2345') is not null then
    raise exception 'INVITE-10 FAILED: a collision was not reported back to the caller';
  end if;
  if ensure_invite_code(v_other, 'ZZZZ9999') <> 'ZZZZ9999' then
    raise exception 'INVITE-10 FAILED: a fresh code was not assigned';
  end if;

  raise notice 'promo + invite storage checks: all passed';
end $$;

rollback;

-- Storage-layer checks for the rate limiter.
--
-- Asserts the things the TypeScript cannot: that the cap holds, that a
-- refused hit is still counted, that a new window starts clean, that the
-- per-bucket cleanup keeps the table at one row per active bucket, and that
-- the argument guards refuse nonsense. Runs inside one transaction and ends
-- in ROLLBACK, so it leaves nothing behind and can be re-run against the
-- same database.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/rate-limit-sql-checks.sql
--
-- Concurrency is deliberately NOT asserted here -- one psql session cannot
-- race itself. That property (12 parallel calls against a cap of 5 allowing
-- exactly 5, with no lost update) is checked by firing real parallel
-- requests at the RPC; see the rate-limit rule in AGENTS.md.

begin;

do $$
declare
  v_bucket text := 'sqlcheck:' || gen_random_uuid()::text;
  v_other  text := 'sqlcheck:' || gen_random_uuid()::text;
  v_r jsonb;
  v_allowed integer := 0;
  v_i integer;
  v_rows integer;
begin
  -- 1. A cap of 3 allows exactly 3 of 6 attempts.
  for v_i in 1..6 loop
    v_r := check_rate_limit(v_bucket, 3, 60);
    if (v_r->>'allowed')::boolean then
      v_allowed := v_allowed + 1;
    end if;
  end loop;
  if v_allowed <> 3 then
    raise exception 'cap not enforced: % allowed of 6 against a cap of 3', v_allowed;
  end if;

  -- 2. A refused hit is still counted. Without this a caller who keeps
  --    trying holds their own window open for ever.
  if (v_r->>'count')::integer <> 6 then
    raise exception 'refused hits are not counted: count is % after 6 attempts', v_r->>'count';
  end if;

  -- 3. Retry-After is a positive whole number of seconds. Zero would invite
  --    an immediate retry that is certain to be refused again.
  if (v_r->>'retry_after_seconds')::integer < 1 then
    raise exception 'retry_after_seconds is %, must be at least 1', v_r->>'retry_after_seconds';
  end if;
  if (v_r->>'retry_after_seconds')::integer > 60 then
    raise exception 'retry_after_seconds is %, must not exceed the window', v_r->>'retry_after_seconds';
  end if;

  -- 4. One bucket's spent allowance does not touch another's.
  v_r := check_rate_limit(v_other, 3, 60);
  if not (v_r->>'allowed')::boolean then
    raise exception 'a fresh bucket was refused: %', v_r::text;
  end if;

  -- 5. Exactly one row per active bucket -- the per-bucket delete is the
  --    whole of the cleanup, so this is what stops the table growing.
  select count(*) into v_rows from rate_limit_counters where bucket = v_bucket;
  if v_rows <> 1 then
    raise exception 'expected 1 counter row for the bucket, found %', v_rows;
  end if;

  -- 6. A shorter window is a different window, so the same bucket starts
  --    clean in it. This is the rollover, without waiting for a clock.
  v_r := check_rate_limit(v_bucket, 3, 1);
  if (v_r->>'count')::integer <> 1 then
    raise exception 'a new window did not start clean: count is %', v_r->>'count';
  end if;

  -- 7. ...and the previous window's row is gone rather than accumulating.
  select count(*) into v_rows from rate_limit_counters where bucket = v_bucket;
  if v_rows <> 1 then
    raise exception 'the old window was not cleaned up, found % rows', v_rows;
  end if;

  raise notice 'rate limiter: cap, counting, retry-after, isolation, cleanup and rollover all hold';
end $$;

-- 8. The argument guards. Each of these must raise rather than quietly
--    accepting a limit that would let everything through.
do $$
begin
  begin
    perform check_rate_limit('', 5, 60);
    raise exception 'an empty bucket was accepted';
  exception when others then
    if sqlerrm = 'an empty bucket was accepted' then raise; end if;
  end;

  begin
    perform check_rate_limit('sqlcheck:guard', 0, 60);
    raise exception 'a limit of 0 was accepted';
  exception when others then
    if sqlerrm = 'a limit of 0 was accepted' then raise; end if;
  end;

  begin
    perform check_rate_limit('sqlcheck:guard', 5, 0);
    raise exception 'a window of 0 seconds was accepted';
  exception when others then
    if sqlerrm = 'a window of 0 seconds was accepted' then raise; end if;
  end;

  raise notice 'rate limiter: argument guards refuse an empty bucket, a zero cap and a zero window';
end $$;

rollback;

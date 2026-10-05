#!/usr/bin/env bash
# Brings up the quality gate's disposable Supabase stack on this machine's
# loopback, installs supabase/schema.sql into it twice, marks it as the gate's
# own, proves it is safe, and seeds the QA fixtures. Every step fails the job:
# a runner whose stack could not be built has proven nothing, and must not
# report green.
#
#   scripts/ci/provision-local-stack.sh            (CI: writes to $GITHUB_ENV)
#   GITHUB_ENV=/tmp/gate.env scripts/ci/provision-local-stack.sh   (by hand)
#
# Needs: the Supabase CLI on PATH (the workflow pins it with
# supabase/setup-cli), Docker, psql, node, and `npm ci` already run.
#
# It never reads .env.local and refuses to run if one exists: a developer's
# file points at a real project. Nothing here can reach a hosted project --
# the only URLs it ever exports come from `supabase status` on this machine,
# and scripts/ci/preflight.mjs rejects anything that is not loopback before
# the first write and again after the marker is in place.
set -euo pipefail

cd "$(dirname "$0")/../.."
ROOT="$(pwd)"
GITHUB_ENV="${GITHUB_ENV:-$ROOT/.gate.env}"
ARTIFACT_DIR="${ARTIFACT_DIR:-$ROOT/e2e-artifacts/provision}"
mkdir -p "$ARTIFACT_DIR"

step() { echo "::group::$1"; }
endstep() { echo "::endgroup::"; }
die() { echo "::error title=Provisioning failed::$1"; exit 1; }

for f in .env .env.local .env.development.local .env.test.local; do
  [ -e "$f" ] && die "$f exists in the workspace; the gate never runs beside a developer env file (it points at a real project)"
done

step "Start the local Supabase stack"
# `supabase start` is idempotent; a second call on a running stack is a no-op.
# The key lines are dropped from the log: they are the CLI's public demo
# keys, but a habit of printing keys is how a real one ends up in a log, and
# ::add-mask:: below only applies from the moment it runs.
supabase start 2>&1 \
  | grep -vE "Pulling|Download|Waiting|Verifying|Extracting|fs layer|Digest|Status: |[Kk]ey:|Database URL" \
  || die "supabase start failed"

# The local gateway reuses pooled keep-alive connections to PostgREST that
# PostgREST has already closed, and under a burst (the specs fire ten
# identical requests at once to prove a guard) Kong answers some of them
# 502 "An invalid response was received from the upstream server" -- its
# log says "upstream prematurely closed connection" / "Connection reset by
# peer". The app reports that as a 500, which reads as a lost race in the
# route rather than as the test stack. Measured on the local stack:
# health-profile.spec.ts failed about one run in three with it, and six of
# six passed with Kong's upstream keep-alive pool switched off (and zero
# resets in the gateway log). This changes only the throwaway local Kong;
# hosted Supabase does not route through it.
docker exec -e KONG_UPSTREAM_KEEPALIVE_POOL_SIZE=0 "$(docker ps --format '{{.Names}}' | grep -E '^supabase_kong_' | head -1)" kong reload \
  || die "could not switch off the local gateway's upstream keep-alive"
endstep

# `supabase status -o env` prints KEY="value" lines for this machine's stack.
status="$(supabase status -o env 2>/dev/null)" || die "supabase status failed"
value() { printf '%s\n' "$status" | sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p" | head -1; }
API_URL="$(value API_URL)"
ANON_KEY="$(value ANON_KEY)"
SERVICE_ROLE_KEY="$(value SERVICE_ROLE_KEY)"
DB_URL="$(value DB_URL)"
[ -n "$API_URL" ] && [ -n "$ANON_KEY" ] && [ -n "$SERVICE_ROLE_KEY" ] && [ -n "$DB_URL" ] \
  || die "supabase status did not report API_URL, ANON_KEY, SERVICE_ROLE_KEY and DB_URL"

# The local stack's keys are the CLI's public demo keys, but masking them
# keeps the log habit uniform with the real secrets.
if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
  echo "::add-mask::$ANON_KEY"
  echo "::add-mask::$SERVICE_ROLE_KEY"
fi

# Superuser connection for the second schema pass (see below). The local
# stack's supabase_admin shares the postgres password.
ADMIN_DB_URL="${DB_URL/postgres:/supabase_admin:}"

export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export DATABASE_URL="$DB_URL"
export CI_LOCAL_STACK=1

step "Preflight (static) -- before anything is written"
node scripts/ci/preflight.mjs --tolerate-blocked --static-only || die "static preflight refused the target"
endstep

step "Apply supabase/schema.sql twice"
# Pass 1 runs as `postgres`, the role the hosted SQL editor uses, so every
# object is owned exactly as it is on staging. Pass 2 is the re-runnability
# proof (CLAUDE.md: "re-apply the file twice"). It runs as the local
# superuser because of a supautils quirk on the local image only: once a
# caught `duplicate_object` from `alter publication ... add table` has fired
# in a session, the postgres role can no longer drop storage.objects
# policies for the rest of that session ("must be owner of relation
# objects"). Pass 1 never hits it (nothing is a duplicate yet); the hosted
# Management API never hits it either. Every guard the file relies on --
# if not exists, drop policy if exists, the duplicate_object wrappers -- is
# still exercised by pass 2.
psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f supabase/schema.sql > "$ARTIFACT_DIR/schema-pass-1.log" 2>&1 \
  || { tail -20 "$ARTIFACT_DIR/schema-pass-1.log"; die "schema.sql failed on its first application"; }
psql "$ADMIN_DB_URL" -X -q -v ON_ERROR_STOP=1 -f supabase/schema.sql > "$ARTIFACT_DIR/schema-pass-2.log" 2>&1 \
  || { tail -20 "$ARTIFACT_DIR/schema-pass-2.log"; die "schema.sql is not re-runnable: its second application failed"; }
endstep

step "Mark the stack as the gate's own"
# The preflight's probe refuses any database without this row, so a URL
# that happens to be loopback (a developer's own tunnel to a hosted project,
# say) is still not enough. No grant to anon/authenticated: it is not data.
psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 <<'SQL' || die "could not write the target marker"
create schema if not exists ci_meta;
revoke all on schema ci_meta from public, anon, authenticated;
create table if not exists ci_meta.ci_target_marker (
  purpose text primary key,
  created_at timestamptz not null default now()
);
revoke all on ci_meta.ci_target_marker from public, anon, authenticated;
insert into ci_meta.ci_target_marker (purpose) values ('quality-gate-local-stack')
on conflict (purpose) do nothing;
SQL
endstep

step "Preflight (with database probe)"
set +e
node scripts/ci/preflight.mjs --tolerate-blocked
code=$?
set -e
[ "$code" -eq 0 ] || die "preflight refused the provisioned stack (exit $code)"
endstep

step "Seed the QA fixture accounts"
node scripts/seed-qa-accounts.mjs > "$ARTIFACT_DIR/seed.log" 2>&1 \
  || { tail -20 "$ARTIFACT_DIR/seed.log"; die "seed-qa-accounts failed; fixtures are not in place"; }
endstep

{
  echo "NEXT_PUBLIC_SUPABASE_URL=$API_URL"
  echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY"
  echo "SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY"
  echo "DATABASE_URL=$DB_URL"
  # Only for re-applying schema.sql (admin-degraded-schema's restore); see
  # localSchemaApplyUrl in e2e/helpers.ts for why it cannot be postgres.
  echo "SCHEMA_APPLY_DATABASE_URL=$ADMIN_DB_URL"
  echo "CI_LOCAL_STACK=1"
} >> "$GITHUB_ENV"

echo "Local stack ready: $API_URL (schema applied twice, marker written, fixtures seeded)."

#!/usr/bin/env bash
# Brings up the quality gate's disposable Supabase stack on this machine's
# loopback, installs supabase/schema.sql into it twice, marks it as the gate's
# own, proves it is safe, and seeds the QA fixtures. Every step fails the job:
# a runner whose stack could not be built has proven nothing, and must not
# report green.
#
#   scripts/ci/provision-local-stack.sh            (CI: writes to $GITHUB_ENV)
#   GITHUB_ENV=/tmp/gate.env scripts/ci/provision-local-stack.sh   (by hand)
#   scripts/ci/provision-local-stack.sh --start-only
#        only bring the containers up, and record the outcome in
#        $ARTIFACT_DIR/stack-start.status. The workflow runs this in the
#        background as its first step, so the image pulls (most of the
#        provisioning time) overlap npm ci and the browser install; the full
#        run that follows, given GATE_STACK_STARTING=background, waits for
#        that status instead of starting again.
#
# Only the services the app and the specs use are started: Postgres, Auth
# (GoTrue), PostgREST, Realtime, Storage and the Kong gateway in front of
# them. Excluded with -x, each checked against src/, e2e/ and scripts/:
#   studio, postgres-meta  the dashboard UI and its API; nothing calls either
#   imgproxy               image transformation; no /render/image URL exists
#   edge-runtime           no Edge Functions (no functions/v1 call anywhere)
#   logflare, vector       log analytics; nothing reads them
#   supavisor              the pooler; DATABASE_URL is the direct port
#   mailpit                the local mail catcher. Email confirmations are
#                          off (supabase/config.toml), no spec requests a
#                          reset or magic link, and the admin access links
#                          use generateLink, which sends nothing. A Docker
#                          failure to bind its port once killed a run.
# Most of these are already off in config.toml; naming them here as well
# keeps the gate lean if that file changes for local use.
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

EXCLUDED_SERVICES="studio,postgres-meta,imgproxy,edge-runtime,logflare,vector,supavisor,mailpit"
# Kept: what `supabase services` lists for these is pulled in parallel up
# front; the CLI alone pulls one image after another.
PREPULL_SERVICES="postgres gotrue postgrest realtime storage-api kong"
STATUS_FILE="$ARTIFACT_DIR/stack-start.status"
START_LOG="$ARTIFACT_DIR/stack-start.log"

# Best effort: a failed or skipped pre-pull only means the CLI pulls the
# image itself. The CLI pulls from public.ecr.aws/supabase/<name>:<tag>.
prepull() {
  local list
  list="$(supabase services -o json 2>/dev/null | node -e '
    const keep = new Set(process.argv[1].split(" "));
    let raw = ""; process.stdin.on("data", (c) => (raw += c)).on("end", () => {
      try {
        for (const s of JSON.parse(raw)) {
          const name = String(s.name).split("/").pop();
          if (keep.has(name) && s.local) console.log(`public.ecr.aws/supabase/${name}:${s.local}`);
        }
      } catch {}
    });' "$PREPULL_SERVICES" 2>/dev/null)" || return 0
  [ -n "$list" ] || return 0
  echo "Pre-pulling in parallel: $(echo $list)"
  for image in $list; do docker pull -q "$image" > /dev/null 2>&1 & done
  wait
}

# `supabase start` is idempotent; a second call on a running stack is a no-op.
# The key lines are dropped from the log: they are the CLI's public demo
# keys, but a habit of printing keys is how a real one ends up in a log, and
# ::add-mask:: below only applies from the moment it runs.
start_once() {
  supabase start -x "$EXCLUDED_SERVICES" 2>&1 \
    | grep -vE "Pulling|Download|Waiting|Verifying|Extracting|fs layer|Digest|Status: |[Kk]ey:|Database URL"
  return "${PIPESTATUS[0]}"
}

# One retry, from nothing: Docker has failed to bind a container's port on
# a fresh runner, and a half-started stack does not recover by itself.
start_stack() {
  prepull
  if start_once; then return 0; fi
  echo "::warning title=supabase start failed::stopping what started and trying once more"
  supabase stop --no-backup > /dev/null 2>&1 || true
  start_once
}

if [ "${1:-}" = "--start-only" ]; then
  rm -f "$STATUS_FILE"
  set +e
  start_stack > "$START_LOG" 2>&1
  code=$?
  set -e
  echo "$code" > "$STATUS_FILE"
  exit "$code"
fi

step "Start the local Supabase stack"
if [ "${GATE_STACK_STARTING:-}" = "background" ]; then
  # An earlier step of this job ran --start-only in the background (the
  # workflow says so with GATE_STACK_STARTING); wait for its verdict rather
  # than racing it with a second start.
  waited=0
  while [ ! -f "$STATUS_FILE" ] && [ "$waited" -lt 600 ]; do sleep 2; waited=$((waited + 2)); done
  cat "$START_LOG" 2>/dev/null || true
  [ -f "$STATUS_FILE" ] || die "the background supabase start gave no verdict in 10 minutes"
  [ "$(cat "$STATUS_FILE")" = "0" ] || die "supabase start failed twice (see stack-start.log)"
  echo "(started in the background; waited ${waited}s here)"
else
  start_stack || die "supabase start failed twice"
fi

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

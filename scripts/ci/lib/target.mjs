// Is this environment safe to run destructive tests against?
//
// The e2e suite, the seed script, the authorization and concurrency scripts
// and the degraded-schema spec all write to a real database with the
// service-role key (CLAUDE.md, "Destructive tooling"). In the quality gate
// they run on a disposable Supabase stack on the runner's own loopback, and
// this module is the thing that refuses to let them near anything else.
//
// `assessTarget` is pure: it takes an environment and, optionally, what a
// probe of the database found, and returns every reason it would refuse. The
// CLI (scripts/ci/preflight.mjs) supplies the real environment and the real
// probe; the unit tests supply hostile ones.
//
// Two kinds of finding, because they are different problems:
//   unsafe   the target could be real (a hosted URL, a live payment key, a
//            database holding someone who is not a fixture). Never proceed.
//   blocked  the target is safe but something the run needs is absent (the
//            Razorpay test keys). Nothing was proven; the gate must be red,
//            but the work that does not need the missing piece can still run.

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** Hostname of a URL-ish string, lower-cased, or null if it will not parse. */
export function hostOf(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    return new URL(value.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isLoopbackHost(host) {
  return typeof host === "string" && LOOPBACK.has(host.toLowerCase());
}

/** A key id that parses as a Razorpay key but is not one a real account issued. */
export function isPlaceholderRazorpayKey(value) {
  if (typeof value !== "string") return true;
  const id = value.trim();
  if (!/^rzp_(test|live)_/.test(id)) return true;
  const body = id.replace(/^rzp_(test|live)_/, "");
  return body.length < 10 || /placeholder|example|dummy|changeme|xxxx|yourkey|yourid/i.test(body);
}

const set = (env, name) => typeof env[name] === "string" && env[name].trim() !== "";

/** Everything the gate treats as a fixture account's address. */
export const FIXTURE_EMAIL_SUFFIX = "@example.test";

/**
 * @param {Record<string, string|undefined>} env
 * @param {null|undefined|{nonFixtureUsers?: number, markerPresent?: boolean}} probe
 *        `undefined`: not probed yet -- only the static rules run (so a hostile
 *        URL is rejected before anything connects to it).
 *        `null`: the probe was attempted and failed -- which is not a pass.
 * @param {{requireRazorpay?: boolean}} [options]
 * @returns {{ok: boolean, unsafe: boolean, blocked: boolean,
 *            reasons: {code: string, kind: "unsafe"|"blocked", message: string}[]}}
 */
export function assessTarget(env, probe, options = {}) {
  const requireRazorpay = options.requireRazorpay !== false;
  const reasons = [];
  const unsafe = (code, message) => reasons.push({ code, kind: "unsafe", message });
  const blocked = (code, message) => reasons.push({ code, kind: "blocked", message });

  // ---- where the app and the database are ----------------------------------
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!set(env, "NEXT_PUBLIC_SUPABASE_URL")) {
    unsafe("supabase-url-missing", "NEXT_PUBLIC_SUPABASE_URL is not set, so the target cannot be shown to be local");
  } else {
    const host = hostOf(supabaseUrl);
    if (!host) {
      unsafe("supabase-url-unparseable", `NEXT_PUBLIC_SUPABASE_URL (${supabaseUrl}) is not a URL`);
    } else if (!isLoopbackHost(host)) {
      unsafe(
        "supabase-url-not-loopback",
        /supabase\.(co|in|com)$/.test(host)
          ? `NEXT_PUBLIC_SUPABASE_URL points at hosted Supabase (${host}); the gate only runs against its own loopback stack`
          : `NEXT_PUBLIC_SUPABASE_URL host "${host}" is not loopback (127.0.0.1 or localhost)`
      );
    }
  }

  if (set(env, "E2E_BASE_URL")) {
    const host = hostOf(env.E2E_BASE_URL);
    if (!host || !isLoopbackHost(host)) {
      unsafe("base-url-not-loopback", `E2E_BASE_URL (${env.E2E_BASE_URL}) must be the app on loopback`);
    }
  }
  if (set(env, "E2E_LOGIN_BASE_URL")) {
    const host = hostOf(env.E2E_LOGIN_BASE_URL);
    if (!host || !isLoopbackHost(host)) {
      unsafe("login-url-not-loopback", `E2E_LOGIN_BASE_URL (${env.E2E_LOGIN_BASE_URL}) must be the app on loopback`);
    }
  }

  if (!set(env, "DATABASE_URL")) {
    unsafe("database-url-missing", "DATABASE_URL is not set, so the database cannot be shown to be local");
  } else {
    const host = hostOf(env.DATABASE_URL);
    if (!host || !isLoopbackHost(host)) {
      unsafe("database-url-not-loopback", `DATABASE_URL host "${host ?? "(unparseable)"}" is not loopback`);
    }
  }

  for (const name of ["SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
    if (!set(env, name)) unsafe("supabase-key-missing", `${name} is not set`);
  }

  // The Management API token turns scripts that fall back to
  // api.supabase.com into scripts that can reach a hosted project. A local
  // stack has no use for one, so its presence is the hazard.
  if (set(env, "SUPABASE_ACCESS_TOKEN")) {
    unsafe(
      "management-token-present",
      "SUPABASE_ACCESS_TOKEN is set; it reaches hosted projects through the Management API and must not exist in a gate environment"
    );
  }

  // ---- things that must stay unset ------------------------------------------
  if (set(env, "ALLOW_DEBUG_DATA_RESET")) {
    unsafe("reset-armed", "ALLOW_DEBUG_DATA_RESET is set; it arms a button that truncates every table and must stay unset");
  }
  const google = Object.keys(env).filter((name) => name.startsWith("GOOGLE_CALENDAR_") && set(env, name));
  if (google.length > 0) {
    unsafe("google-calendar-configured", `${google.join(", ")} set; real Calendar/Meet credentials do not belong in CI`);
  }

  // ---- Razorpay: test keys only, and live keys are a hard stop --------------
  const keyIds = [env.NEXT_PUBLIC_RAZORPAY_KEY_ID, env.RAZORPAY_KEY_ID].filter(
    (v) => typeof v === "string" && v.trim() !== ""
  );
  const liveShaped = [env.NEXT_PUBLIC_RAZORPAY_KEY_ID, env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET].some(
    (v) => typeof v === "string" && /rzp_live_/.test(v)
  );
  if (liveShaped) {
    unsafe("razorpay-live-key", "a rzp_live_ Razorpay credential is present; only rzp_test_ keys may ever be used here");
  }
  const notTest = keyIds.filter((id) => !/^rzp_(test|live)_/.test(id.trim()));
  if (notTest.length > 0) {
    unsafe("razorpay-key-unrecognised", "a Razorpay key id is set that does not start with rzp_test_");
  }
  if (requireRazorpay && !liveShaped && notTest.length === 0) {
    const realKey = keyIds.some((id) => !isPlaceholderRazorpayKey(id));
    const hasSecret = set(env, "RAZORPAY_KEY_SECRET") && !/placeholder|changeme|example/i.test(env.RAZORPAY_KEY_SECRET);
    if (!realKey || !hasSecret) {
      blocked(
        "razorpay-test-keys-missing",
        "no usable Razorpay test keys (repo secrets RAZORPAY_TEST_KEY_ID / RAZORPAY_TEST_KEY_SECRET are absent, empty or placeholders)"
      );
    }
  }

  // ---- what the database actually holds ------------------------------------
  if (probe === null) {
    unsafe("probe-failed", "the database probe did not complete, so the target was not verified (an unchecked target is not a safe one)");
  } else if (probe !== undefined) {
    if (probe.markerPresent !== true) {
      unsafe(
        "marker-missing",
        "the database has no ci_meta.ci_target_marker row written by scripts/ci/provision-local-stack.sh; it is not a stack this gate created"
      );
    }
    if (typeof probe.nonFixtureUsers !== "number") {
      unsafe("probe-incomplete", "the database probe did not report how many non-fixture users exist");
    } else if (probe.nonFixtureUsers > 0) {
      unsafe(
        "non-fixture-users",
        `${probe.nonFixtureUsers} auth user(s) are not ${FIXTURE_EMAIL_SUFFIX} fixtures; this database may hold real people`
      );
    }
  }

  return {
    ok: reasons.length === 0,
    unsafe: reasons.some((r) => r.kind === "unsafe"),
    blocked: reasons.some((r) => r.kind === "blocked"),
    reasons,
  };
}

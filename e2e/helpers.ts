// Shared helpers for the e2e suite. Everything here talks to Supabase and
// the app's own HTTP API directly (via Node/Playwright's request context,
// never a browser page) -- this suite is scoped to money-moving server
// logic, not UI rendering, per the QA plan's "lightweight" scope decision.
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

export const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
export const TEST_PASSWORD = "QaTest!2024pass";

export const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
export const SUPABASE_ANON_KEY = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
export const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set -- the e2e suite needs a real (test/staging) Supabase project's credentials in the environment or .env.local. See README.md.`
    );
  }
  return value;
}

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Signs in as a seeded test account and returns a `Cookie` header value
 * carrying a real session -- produced via @supabase/ssr's own
 * createServerClient/setSession (not hand-encoded), so it's byte-for-byte
 * what the app's own server client expects to read back.
 */
export async function cookieHeaderFor(email: string): Promise<string> {
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // Retried, because the suite mints a session per spec and GoTrue rate-limits
  // its token endpoint under that burst. A throttled sign-in comes back with
  // an empty body, so the thrown message read `sign-in failed for ...: {}` --
  // which looks exactly like a missing or mis-seeded fixture and sent the
  // reader to `npm run seed:qa` for a problem seeding cannot fix.
  //
  // The status and error name go in the message for the same reason: the one
  // thing that tells a 429 apart from a genuinely wrong password is the thing
  // the old message dropped.
  let data: Awaited<ReturnType<typeof anon.auth.signInWithPassword>>["data"] | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const result = await anon.auth.signInWithPassword({ email, password: TEST_PASSWORD });
    if (!result.error && result.data.session) {
      data = result.data;
      break;
    }
    lastError = result.error;
    const status = (result.error as { status?: number } | null)?.status;
    // 400 with a real message is a wrong password or a missing account, and no
    // amount of waiting fixes it. Anything else -- 429, 5xx, an empty body --
    // is worth one more try.
    const permanent = status === 400 && !!result.error?.message && result.error.message !== "{}";
    if (permanent) break;
    await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
  }
  if (!data?.session) {
    const e = lastError as { message?: string; name?: string; status?: number } | null;
    throw new Error(
      `sign-in failed for ${email} after 4 attempts: ` +
        `status=${e?.status ?? "?"} name=${e?.name ?? "?"} message=${e?.message || "(empty body)"}`
    );
  }

  const collected: { name: string; value: string }[] = [];
  const ssrClient = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => [],
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) collected.push({ name, value });
      },
    },
  });
  const { error: setError } = await ssrClient.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  if (setError) throw new Error(`setSession failed for ${email}: ${setError.message}`);
  return collected.map((c) => `${c.name}=${encodeURIComponent(c.value)}`).join("; ");
}

/**
 * The same session as cookieHeaderFor(), shaped for a browser context.
 *
 * Signing in through the login page needs the *browser* to reach Supabase,
 * which a sandboxed environment with an egress proxy may not allow (Node
 * does, the browser does not -- the symptom is a bare "Failed to fetch" on
 * the auth call). Minting the session in Node and handing the browser the
 * resulting cookies keeps the UI specs testing the dashboard rather than
 * testing the environment's network policy.
 */
export async function browserCookiesFor(email: string) {
  const header = await cookieHeaderFor(email);
  const { hostname } = new URL(BASE);
  return header.split("; ").map((pair) => {
    const index = pair.indexOf("=");
    return {
      name: pair.slice(0, index),
      value: pair.slice(index + 1),
      domain: hostname,
      path: "/",
    };
  });
}

export const QA_EMAILS = {
  admin: "qa.admin@example.test",
  therapistA: "qa.therapist.a@example.test",
  therapistB: "qa.therapist.b@example.test",
  therapistC: "qa.therapist.c@example.test",
  patientA: "qa.patient.a@example.test",
  patientB: "qa.patient.b@example.test",
  hospital: "qa.hospital@example.test",
} as const;

export async function profileIdFor(admin: SupabaseClient, email: string): Promise<string> {
  const { data, error } = await admin.from("profiles").select("id").eq("email", email).single();
  if (error || !data) throw new Error(`no seeded profile for ${email} -- run the e2e global setup first`);
  return data.id;
}

/**
 * An ISO instant `hoursAhead` from now, landing exactly on the hour.
 *
 * `new Date(Date.now() + n * 3_600_000)` carries whatever minutes the clock
 * happened to hold, so a slot built that way is only ever bookable when the
 * suite is run exactly on the hour. Every door that writes a slot time
 * refuses the rest with `NOT_WHOLE_HOUR_ERROR` -- "Sessions start on the
 * hour" -- which surfaces as a 400 where the spec expected its own rule to
 * be the thing under test, so a bulk-limit test reported the limit was not
 * enforced and a concurrency test saw both racers lose.
 *
 * The minutes are zeroed in local time, and `playwright.config.ts` pins that
 * to the clinic's zone -- which is the zone the routes judge against, since
 * the rule is checked in the booking's own timezone rather than the
 * server's.
 */
export function wholeHourFromNow(hoursAhead: number): string {
  const d = new Date(Date.now() + hoursAhead * 3_600_000);
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}

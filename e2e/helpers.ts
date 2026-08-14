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
  const { data, error } = await anon.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error || !data.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);

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

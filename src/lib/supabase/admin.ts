import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Privileged server-only client using the Supabase service role key.
 * Bypasses Row Level Security entirely — never import this from a
 * Client Component or expose it to the browser. Use only inside Route
 * Handlers / server code that needs to write fields the signed-in user
 * isn't allowed to touch directly (e.g. payment status).
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
}

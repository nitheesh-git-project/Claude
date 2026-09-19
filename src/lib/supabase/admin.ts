import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { resilientSupabaseFetch } from "./resilientFetch";

/**
 * Privileged server-only client using the Supabase service role key.
 * Bypasses Row Level Security entirely - never import this from a
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
      // Bounded, deadlined transport -- see resilientFetch.ts. Without it a
      // burst of concurrent renders opens a socket per query and the
      // handshakes time out before any of them reach the database.
      global: { fetch: resilientSupabaseFetch },
    }
  );
}

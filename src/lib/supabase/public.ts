import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Stateless anon-key client for public, unauthenticated reads in Server
 * Components — e.g. the marketing pages' active-category listings. Unlike
 * server.ts, this never touches cookies(), so pages using it can actually
 * be statically generated / ISR-cached instead of being forced into
 * per-request dynamic rendering just to read public data. Still respects
 * RLS under the anon key — this is not a service-role bypass.
 */
export function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The ids of the stories whose patient's written consent is on file
 * (testimonialTrust.ts). Its own read, so the quotes and this question fail
 * apart; null when it could not be answered -- a database without the
 * columns, or a failed read -- which consentedPublicTestimonials() treats as
 * "show nothing". The database's public read policy only returns consented
 * stories anyway; this is the app's own lock on the same door.
 */
export async function readConsentedStoryIds(db: SupabaseClient): Promise<Set<string> | null> {
  try {
    const { data, error } = await db.from("testimonials").select("id, consent_recorded_at").not("consent_recorded_at", "is", null);
    if (error) return null;
    return new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
  } catch {
    return null;
  }
}

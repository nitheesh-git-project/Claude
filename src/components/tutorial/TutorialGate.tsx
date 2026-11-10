import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { IMPERSONATION_COOKIE, isExpired, parseMarker } from "@/lib/impersonation";
import type { TutorialRole } from "@/lib/tutorial";
import TutorialProvider from "./TutorialProvider";

/**
 * Mounts the dashboard tutorial for one role, from that role's layout, and
 * decides whether it opens by itself.
 *
 * It opens on the person's first visit -- `profiles.onboarding_seen_at` is
 * null -- and on nothing else. Two things keep it shut:
 *
 * - **A read that failed.** "We couldn't tell whether you've seen it" is not
 *   "you haven't": a tour that sprang open over somebody's working
 *   dashboard every time the database blinked would be worse than missing
 *   one first visit, and the (i) buttons still reach it.
 * The read is handed to the provider as a promise rather than awaited here,
 * so no dashboard waits for it.
 *
 * - **An admin viewing as this person.** The admin can still open it from
 *   any (i), but their visit neither opens it nor uses up the person's own.
 */
export default async function TutorialGate({ role, children }: { role: TutorialRole; children: React.ReactNode }) {
  const jar = await cookies();
  const marker = parseMarker(jar.get(IMPERSONATION_COOKIE)?.value);
  const impersonating = !!marker && !isExpired(marker, nowTimestamp());

  // Not awaited: the dashboard renders now, and the provider opens the tour
  // once this answers. Holding the page for a flag that matters only on a
  // first visit was a round trip on every dashboard load.
  const autoStart = impersonating ? Promise.resolve(false) : readAutoStart(role);

  return (
    <TutorialProvider role={role} autoStart={autoStart} canMarkSeen={!impersonating}>
      {children}
    </TutorialProvider>
  );
}

async function readAutoStart(role: TutorialRole): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user ?? null;
    if (!user) return false;
    const { data, error } = await supabase
      .from("profiles")
      .select("role, onboarding_seen_at")
      .eq("id", user.id)
      .maybeSingle();
    return !error && data?.role === role && !data.onboarding_seen_at;
  } catch {
    return false;
  }
}

function nowTimestamp() {
  return Date.now();
}

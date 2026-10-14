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
 * - **An admin viewing as this person.** The admin can still open it from
 *   any (i), but their visit neither opens it nor uses up the person's own.
 */
export default async function TutorialGate({ role, children }: { role: TutorialRole; children: React.ReactNode }) {
  const jar = await cookies();
  const marker = parseMarker(jar.get(IMPERSONATION_COOKIE)?.value);
  const impersonating = !!marker && !isExpired(marker, nowTimestamp());

  let autoStart = false;
  if (!impersonating) {
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user ?? null;
    if (user) {
      const { data, error } = await supabase
        .from("profiles")
        .select("role, onboarding_seen_at")
        .eq("id", user.id)
        .maybeSingle();
      autoStart = !error && data?.role === role && !data.onboarding_seen_at;
    }
  }

  return (
    <TutorialProvider role={role} autoStart={autoStart} canMarkSeen={!impersonating}>
      {children}
    </TutorialProvider>
  );
}

function nowTimestamp() {
  return Date.now();
}

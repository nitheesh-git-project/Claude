import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { IMPERSONATION_COOKIE, isExpired, parseMarker } from "@/lib/impersonation";
import { currentTermsVersion, latestTermsVersion, needsTermsAcceptance } from "@/lib/policyAcceptance";
import AcceptTermsScreen from "./AcceptTermsScreen";

/**
 * Stops a signed-in patient, therapist or hospital partner at "We've updated
 * our Terms" until they have agreed to the version in force -- people who
 * signed up before the tick box existed, accounts staff created, and
 * everybody again after the legal pages' effective date moves.
 *
 * Three things keep it open, never shut:
 *  - a read that failed ("could not check" is not "has not agreed": nobody
 *    is locked out of their care over a database blink);
 *  - nobody signed in (the proxy handles that);
 *  - a staff member viewing as this person, who cannot agree on their
 *    behalf and must still be able to see the dashboard.
 */
export default async function TermsGate({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const marker = parseMarker(jar.get(IMPERSONATION_COOKIE)?.value);
  if (marker && !isExpired(marker, nowTimestamp())) return <>{children}</>;

  const latest = await readLatestTermsVersion();
  if (!needsTermsAcceptance(latest)) return <>{children}</>;
  return <AcceptTermsScreen version={currentTermsVersion()} firstTime={latest === null} />;
}

function nowTimestamp() {
  return Date.now();
}

/** null: none on file. undefined: the read failed, or nobody is signed in. */
async function readLatestTermsVersion(): Promise<string | null | undefined> {
  try {
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user ?? null;
    if (!user) return undefined;
    const { data, error } = await supabase
      .from("policy_acceptances")
      .select("document, version, accepted_at")
      .eq("user_id", user.id)
      .eq("document", "terms_privacy")
      .order("accepted_at", { ascending: false })
      .limit(5);
    if (error) return undefined;
    return latestTermsVersion(data ?? []);
  } catch {
    return undefined;
  }
}

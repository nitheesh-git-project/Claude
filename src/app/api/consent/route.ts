import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { enforceRateLimit } from "@/lib/rateLimitServer";
import { validateConsentRecord } from "@/lib/cookieConsent";
import { geoCountryFromHeaders } from "@/lib/countryGeo";
import { IMPERSONATION_COOKIE } from "@/lib/impersonation";

// Records a choice made in the cookie pop-up (src/components/system/Analytics.tsx).
//
// Public: most visitors choosing are not signed in. The table has no insert
// policy and no insert grant, so this route is the only way in. Only the
// shape of the choice comes from the client; who is signed in and the
// country are worked out here, and no IP address is stored.
//
// POST body: { visitorId, analytics, marketing, action, policyVersion, pagePath }
// -> 200 { success: true }, 400 a malformed or self-contradicting body, 429.
export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<Record<string, unknown>>(request);
  if (parseError) return parseError;

  const checked = validateConsentRecord(body);
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }

  const limited = await enforceRateLimit(request, "cookieConsent");
  if (limited) return limited;

  // The signed-in person, if any. A staff member viewing the site as a
  // patient is not that patient choosing, so nothing is linked then. A
  // failed read is recorded as "not signed in" rather than refused: the
  // choice itself is what matters, and it is already in the browser.
  let userId: string | null = null;
  if (!request.cookies.get(IMPERSONATION_COOKIE)) {
    try {
      const supabase = await createClient();
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id ?? null;
    } catch {
      userId = null;
    }
  }

  const { error } = await createAdminClient().from("cookie_consents").insert({
    visitor_id: checked.value.visitorId,
    user_id: userId,
    analytics: checked.value.analytics,
    marketing: checked.value.marketing,
    action: checked.value.action,
    policy_version: checked.value.policyVersion,
    page_path: checked.value.pagePath,
    country: geoCountryFromHeaders(request.headers),
  });

  if (error) {
    console.error("Could not record a cookie consent choice", error.message);
    return NextResponse.json({ error: "Could not record your choice." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

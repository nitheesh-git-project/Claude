import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverError } from "@/lib/apiError";
import { summariseConsents, type ConsentRow, type ConsentAction } from "@/lib/cookieConsent";

// Settings -> Cookie consent: what visitors chose in the cookie pop-up.
//
// GET ?days=7|30|90 -> 200 {
//   days, summary: ConsentSummary, capped: boolean,
//   recent: { created_at, action, analytics, marketing, policy_version,
//             page_path, country, signed_in }[]
// }
// The summary counts every choice in the window up to SUMMARY_CAP rows;
// `capped` says when it stopped short, so the screen never presents a
// partial count as the whole. Settings scope, like every Settings screen.
const ALLOWED_DAYS = [7, 30, 90] as const;
const SUMMARY_CAP = 20000;
const RECENT = 50;

export async function GET(request: NextRequest) {
  const adminUser = await requireAdminScope("settings");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const asked = Number(request.nextUrl.searchParams.get("days"));
  const days = (ALLOWED_DAYS as readonly number[]).includes(asked) ? asked : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const admin = createAdminClient();
  const [summaryRead, recentRead] = await Promise.all([
    admin
      .from("cookie_consents")
      .select("action, analytics, marketing")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(SUMMARY_CAP),
    admin
      .from("cookie_consents")
      .select("created_at, action, analytics, marketing, policy_version, page_path, country, user_id")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(RECENT),
  ]);
  if (summaryRead.error) return serverError("admin/cookie-consents:summary", summaryRead.error);
  if (recentRead.error) return serverError("admin/cookie-consents:recent", recentRead.error);

  const rows = (summaryRead.data ?? []) as ConsentRow[];
  return NextResponse.json({
    days,
    summary: summariseConsents(rows),
    capped: rows.length >= SUMMARY_CAP,
    recent: (recentRead.data ?? []).map((r) => ({
      created_at: r.created_at as string,
      action: r.action as ConsentAction,
      analytics: r.analytics as boolean,
      marketing: r.marketing as boolean,
      policy_version: r.policy_version as string,
      page_path: (r.page_path as string | null) ?? null,
      country: (r.country as string | null) ?? null,
      // Whether they were signed in, not who: this screen is about choices.
      signed_in: !!r.user_id,
    })),
  });
}

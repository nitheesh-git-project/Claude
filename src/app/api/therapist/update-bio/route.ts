import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { serverError } from "@/lib/apiError";
import { parseRichTextInput } from "@/lib/richText";
import {
  describeProfileStanding,
  getProfileStanding,
} from "@/lib/supabase/requireActiveProfile";

// The therapist's own bio, written in the Docs-style editor and shown in
// their /team popup. It used to be saved straight from the browser through
// the profile's RLS update, which had two gaps: nothing sanitised what was
// stored, and nothing invalidated /team, so an edit stayed invisible on the
// live page until the ISR window lapsed. This route closes both -- the
// editor's JSON is rebuilt from the allow-list in src/lib/richText.ts, and
// /team is revalidated -- and only the caller's own row is ever written.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{ content?: unknown }>(request);
  if (parseError) return parseError;
  if (!("content" in body)) {
    return NextResponse.json({ error: "Missing content" }, { status: 400 });
  }
  const parsed = parseRichTextInput(body.content);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const standing = await getProfileStanding(user.id, "therapist");
  if (!standing.ok) {
    const { status, error } = describeProfileStanding(standing.reason);
    return NextResponse.json({ error }, { status });
  }

  // The bio is public (the Our Team page), so it waits for the clinic like
  // the credentials beside it: the change becomes a profile_change_requests
  // row and the live bio stays as approved until an admin approves this one
  // (approve-profile-change applies it; GATED_PROFILE_FIELDS allows "bio").
  // One pending bio at a time -- a newer edit replaces the earlier pending
  // one, and saving the bio that is already live just withdraws it.
  const admin = createAdminClient();
  const { data: live, error: liveError } = await admin
    .from("profiles")
    .select("bio")
    .eq("id", user.id)
    .eq("role", "therapist")
    .maybeSingle();
  if (liveError) return serverError("therapist/update-bio", liveError);
  if (!live) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: pending, error: pendingError } = await admin
    .from("profile_change_requests")
    .select("id, changes")
    .eq("user_id", user.id)
    .eq("status", "pending");
  if (pendingError) return serverError("therapist/update-bio", pendingError);
  const earlierBioOnly = (pending ?? [])
    .filter((r) => {
      const keys = Object.keys((r.changes ?? {}) as Record<string, unknown>);
      return keys.length === 1 && keys[0] === "bio";
    })
    .map((r) => r.id as string);
  if (earlierBioOnly.length > 0) {
    const { error: withdrawError } = await admin
      .from("profile_change_requests")
      .delete()
      .in("id", earlierBioOnly)
      .eq("status", "pending");
    if (withdrawError) return serverError("therapist/update-bio", withdrawError);
  }

  if ((live.bio ?? null) === parsed.value) {
    return NextResponse.json({ success: true, pending: false });
  }

  const { error } = await admin
    .from("profile_change_requests")
    .insert({ user_id: user.id, changes: { bio: parsed.value }, status: "pending" });
  if (error) return serverError("therapist/update-bio", error);

  return NextResponse.json({ success: true, pending: true });
}

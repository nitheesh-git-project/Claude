import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
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

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ bio: parsed.value })
    .eq("id", user.id)
    .eq("role", "therapist");
  if (error) return serverError("therapist/update-bio", error);

  revalidatePath("/team");
  return NextResponse.json({ success: true });
}

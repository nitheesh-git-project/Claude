import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import {
  MAX_PRINCIPLE_BODY_LENGTH,
  MAX_PRINCIPLE_TITLE_LENGTH,
  MISSION_ICONS,
  isMissionPrincipleKind,
} from "@/lib/mission";

/**
 * Writes one promise or one limit -- a new row when no id is given, an edit
 * when one is.
 *
 * One route for both, because it is one form and one set of rules; two audit
 * actions, because "added a promise" and "reworded a promise" are different
 * things to read back in six months.
 *
 * The icon is checked against MISSION_ICONS rather than accepted as text: a
 * Font Awesome class this app does not load renders an empty square on the
 * mission page, and nothing about a blank box tells anybody whether the icon
 * failed or the row did.
 */
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("settings");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: payload, error: parseError } = await parseJsonBody<{
    id?: string;
    kind?: string;
    title?: string;
    body?: string;
    icon?: string;
    active?: boolean;
  }>(request);
  if (parseError) return parseError;
  const { id, kind, title, body, icon, active } = payload;

  if (!isMissionPrincipleKind(kind)) {
    return NextResponse.json({ error: "Unknown kind." }, { status: 400 });
  }
  if (typeof title !== "string" || title.trim().length === 0) {
    return NextResponse.json({ error: "Give it a title." }, { status: 400 });
  }
  if (title.trim().length > MAX_PRINCIPLE_TITLE_LENGTH) {
    return NextResponse.json(
      { error: `Keep the title to ${MAX_PRINCIPLE_TITLE_LENGTH} characters or fewer.` },
      { status: 400 }
    );
  }
  if (typeof body !== "string" || body.trim().length === 0) {
    return NextResponse.json({ error: "Give it a line of explanation." }, { status: 400 });
  }
  if (body.trim().length > MAX_PRINCIPLE_BODY_LENGTH) {
    return NextResponse.json(
      { error: `Keep the line to ${MAX_PRINCIPLE_BODY_LENGTH} characters or fewer.` },
      { status: 400 }
    );
  }
  if (icon != null && !(MISSION_ICONS as readonly string[]).includes(icon)) {
    return NextResponse.json({ error: "Pick one of the icons offered." }, { status: 400 });
  }
  if (active != null && typeof active !== "boolean") {
    return NextResponse.json({ error: "value must be a boolean" }, { status: 400 });
  }

  const admin = createAdminClient();
  const nextTitle = title.trim();
  const nextBody = body.trim();
  const isEdit = typeof id === "string" && id.length > 0;

  if (isEdit) {
    // The previous wording, read before the write, so the log can say what it
    // was changed from -- an entry recording that a promise was edited
    // without saying what it used to say is unusable for the one question it
    // gets asked.
    const { data: before } = await admin
      .from("mission_principles")
      .select("title, body, icon, active, kind")
      .eq("id", id)
      .maybeSingle();
    if (!before) {
      return NextResponse.json({ error: "That one no longer exists." }, { status: 404 });
    }

    const { data: updated, error } = await admin
      .from("mission_principles")
      .update({
        kind,
        title: nextTitle,
        body: nextBody,
        icon: icon ?? null,
        ...(typeof active === "boolean" ? { active } : {}),
      })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    // supabase-js reports no error for an UPDATE that matched nothing, so the
    // row coming back is what distinguishes "changed it" from "changed
    // nothing" -- the same rule delete-treatment-category follows.
    if (!updated) {
      return NextResponse.json({ error: "That one no longer exists." }, { status: 404 });
    }

    await recordAdminActivity(admin, adminUser.id, {
      action: "mission_principle.update",
      targetId: id,
      targetLabel: nextTitle,
      details: {
        kind,
        from: { title: before.title, body: before.body, active: before.active },
        to: { title: nextTitle, body: nextBody, active: active ?? before.active },
      },
    });
  } else {
    // Appended rather than created at 0: a new promise landing on top of
    // everything at the same order is the tie that makes the arrows appear to
    // do nothing, which is the bug set_mission_principle_order exists for.
    const { data: last } = await admin
      .from("mission_principles")
      .select("display_order")
      .eq("kind", kind)
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: created, error } = await admin
      .from("mission_principles")
      .insert({
        kind,
        title: nextTitle,
        body: nextBody,
        icon: icon ?? null,
        active: typeof active === "boolean" ? active : true,
        display_order: (last?.display_order ?? 0) + 1,
      })
      .select("id")
      .maybeSingle();
    if (error || !created) {
      return NextResponse.json(
        { error: error?.message ?? "Could not save. Please try again." },
        { status: 500 }
      );
    }

    await recordAdminActivity(admin, adminUser.id, {
      action: "mission_principle.create",
      targetId: created.id,
      targetLabel: nextTitle,
      details: { kind, title: nextTitle, body: nextBody },
    });
  }

  // Both bands render on the home page (the promise titles) and on /mission
  // (both, in full), and both pages are ISR-cached for five minutes.
  revalidatePath("/");
  revalidatePath("/mission");

  return NextResponse.json({ success: true });
}

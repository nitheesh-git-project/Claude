import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { enforceRateLimit } from "@/lib/rateLimitServer";
import { serverError } from "@/lib/apiError";
import { readDashboardViewer, type DashboardViewer } from "@/lib/dashboardViewer";
import {
  NOTEBOOK_MAX_PAGES,
  NOTEBOOK_PAGE_SELECT,
  isNotebookRole,
  notebookPagePreview,
  orderNotebookPages,
  parseNotebookPageInput,
  type NotebookPageRow,
} from "@/lib/notebook";

// The notebook: one person's private pages (src/lib/notebook.ts).
//
// The whole privacy promise is in this file and one RLS policy. Every query
// here is filtered by the session's own user id -- an id from the body only
// ever names a page *within* that person's pages -- and an admin signed in
// as somebody is refused outright, because a session swap is otherwise
// indistinguishable from the owner and "Only you can read this" would be
// false. Nothing else in the app reads `notebook_pages`: no admin screen,
// no export, no therapist view.
//
// GET                -> 200 { pages: [{ id, created_at, updated_at, preview }] }
// GET ?page=<id>     -> 200 { page: { id, body, created_at, updated_at } }, 404
// POST { action: "create" }                 -> 200 { page }
// POST { action: "save", id, content }      -> 200 { success: true, updated_at }
// POST { action: "delete", id }             -> 200 { success: true }
// Every verb: 401 not signed in, 403 not this account's to open, 429, 503.

function refuse(viewer: DashboardViewer): NextResponse | null {
  if (viewer.status === "anonymous") return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (viewer.status === "unreadable") {
    return NextResponse.json({ error: "We couldn't check your account just now. Please try again." }, { status: 503 });
  }
  if (viewer.impersonating) {
    return NextResponse.json(
      { error: "A notebook is private to its owner. It is not shown while you are signed in as them." },
      { status: 403 }
    );
  }
  if (!viewer.active) return NextResponse.json({ error: "Your account has been suspended." }, { status: 403 });
  if (!isNotebookRole(viewer.role)) {
    return NextResponse.json({ error: "There is no notebook on this account." }, { status: 403 });
  }
  return null;
}

const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(request: NextRequest) {
  const viewer = await readDashboardViewer();
  const refused = refuse(viewer);
  if (refused) return refused;
  if (viewer.status !== "ok") return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const pageId = request.nextUrl.searchParams.get("page");
  if (pageId) {
    if (!UUID.test(pageId)) return NextResponse.json({ error: "Unknown page." }, { status: 400 });
    const { data, error } = await admin
      .from("notebook_pages")
      .select(NOTEBOOK_PAGE_SELECT)
      .eq("user_id", viewer.userId)
      .eq("id", pageId)
      .maybeSingle();
    if (error) return serverError("notebook:page", error);
    if (!data) return NextResponse.json({ error: "That page is no longer in your notebook." }, { status: 404 });
    return NextResponse.json({ page: data as NotebookPageRow });
  }

  const { data, error } = await admin
    .from("notebook_pages")
    .select(NOTEBOOK_PAGE_SELECT)
    .eq("user_id", viewer.userId)
    .order("created_at", { ascending: true })
    .limit(NOTEBOOK_MAX_PAGES);
  if (error) return serverError("notebook:list", error);
  const pages = orderNotebookPages((data ?? []) as NotebookPageRow[]).map((p) => ({
    id: p.id,
    created_at: p.created_at,
    updated_at: p.updated_at,
    preview: notebookPagePreview(p.body),
  }));
  return NextResponse.json({ pages });
}

export async function POST(request: NextRequest) {
  const viewer = await readDashboardViewer();
  const refused = refuse(viewer);
  if (refused) return refused;
  if (viewer.status !== "ok") return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: body, error: parseError } = await parseJsonBody<{
    action?: unknown;
    id?: unknown;
    content?: unknown;
  }>(request);
  if (parseError) return parseError;

  const limited = await enforceRateLimit(request, "notebook", { identifier: viewer.userId });
  if (limited) return limited;

  const admin = createAdminClient();

  if (body.action === "create") {
    const { count, error: countError } = await admin
      .from("notebook_pages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", viewer.userId);
    if (countError) return serverError("notebook:count", countError);
    if ((count ?? 0) >= NOTEBOOK_MAX_PAGES) {
      return NextResponse.json(
        { error: "Your notebook is full. Delete a page you no longer need to add a new one." },
        { status: 409 }
      );
    }
    const { data, error } = await admin
      .from("notebook_pages")
      .insert({ user_id: viewer.userId, body: null })
      .select(NOTEBOOK_PAGE_SELECT)
      .single();
    if (error) return serverError("notebook:create", error);
    return NextResponse.json({ page: data as NotebookPageRow });
  }

  if (typeof body.id !== "string" || !UUID.test(body.id)) {
    return NextResponse.json({ error: "Unknown page." }, { status: 400 });
  }

  if (body.action === "save") {
    const parsed = parseNotebookPageInput(body.content);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const updatedAt = new Date().toISOString();
    const { data, error } = await admin
      .from("notebook_pages")
      .update({ body: parsed.value, updated_at: updatedAt })
      .eq("user_id", viewer.userId)
      .eq("id", body.id)
      .select("id")
      .maybeSingle();
    if (error) return serverError("notebook:save", error);
    if (!data) return NextResponse.json({ error: "That page is no longer in your notebook." }, { status: 404 });
    return NextResponse.json({ success: true, updated_at: updatedAt });
  }

  if (body.action === "delete") {
    const { error } = await admin
      .from("notebook_pages")
      .delete()
      .eq("user_id", viewer.userId)
      .eq("id", body.id);
    if (error) return serverError("notebook:delete", error);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

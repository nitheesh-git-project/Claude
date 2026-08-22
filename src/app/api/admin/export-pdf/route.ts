import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createClient } from "@/lib/supabase/server";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { buildTablePdf, tablePdfFilename } from "@/lib/tablePdf";

// Typesets rows the admin is already looking at. Every admin export screen
// posts here, which is why this route reads nothing: the caller sends the
// exact filtered rows it rendered, so the CSV and the PDF are guaranteed to
// be the same table rather than two queries that might disagree.
//
// That also means there is nothing here to scope-check -- the screen that
// produced the rows was already gated by requireAdminScope, and this route
// discloses nothing the caller did not send. It is still admin-only so it
// isn't a free PDF renderer for anyone with a session.
const MAX_ROWS = 10_000;
const MAX_COLUMNS = 40;

export async function POST(request: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    title?: unknown;
    subtitle?: unknown;
    filename?: unknown;
    columns?: unknown;
    rows?: unknown;
  }>(request);
  if (parseError) return parseError;

  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Export";
  const subtitle = typeof body.subtitle === "string" ? body.subtitle : undefined;
  const filenameBase = typeof body.filename === "string" && body.filename.trim() ? body.filename : title;

  if (!Array.isArray(body.columns) || body.columns.some((c) => typeof c !== "string")) {
    return NextResponse.json({ error: "Missing columns" }, { status: 400 });
  }
  if (!Array.isArray(body.rows)) {
    return NextResponse.json({ error: "Missing rows" }, { status: 400 });
  }
  const columns = (body.columns as string[]).slice(0, MAX_COLUMNS);
  if (columns.length === 0) {
    return NextResponse.json({ error: "Missing columns" }, { status: 400 });
  }
  if (body.rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `That's more than ${MAX_ROWS.toLocaleString("en-IN")} rows — narrow the filters, or use the CSV.` },
      { status: 400 }
    );
  }
  const rows = (body.rows as unknown[]).map((row) =>
    Array.isArray(row) ? row.slice(0, MAX_COLUMNS).map((cell) => (cell == null ? "" : String(cell))) : []
  );

  const supabase = await createClient();
  const { data: settings } = await supabase.from("site_settings").select("site_name").maybeSingle();

  const generatedAt = new Date();
  const pdf = await buildTablePdf({
    siteName: settings?.site_name ?? "Dr. Pooja's Physio",
    title,
    subtitle,
    columns,
    rows,
    generatedAt,
  });

  // A fresh ArrayBuffer: pdf-lib's view can sit inside a larger pooled
  // buffer, and handing that straight to NextResponse would serve whatever
  // else happens to share it.
  return new NextResponse(pdf.slice().buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${tablePdfFilename(filenameBase, generatedAt)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

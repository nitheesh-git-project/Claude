import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { normalizePincode, isValidPincodeShape } from "@/lib/homeVisitAreas";

// Plural on purpose. A serviceable city is dozens of pincodes, and adding
// them one at a time is the kind of chore that ends in a half-configured
// catchment -- which shows up as patients being told we don't serve an area
// we actually do. The admin form takes a pasted list against one city and
// one travel fee, and this route normalizes, de-duplicates and validates it
// as a batch.
const MAX_PINCODES_PER_REQUEST = 200;
const MAX_CITY_LENGTH = 120;
const MAX_AREA_NAME_LENGTH = 120;

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("catalog");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    city?: string;
    areaName?: string | null;
    pincodes?: unknown;
    travelFeeInr?: number | string;
    notes?: string | null;
  }>(request);
  if (parseError) return parseError;

  const city = typeof body.city === "string" ? body.city.trim() : "";
  if (!city) {
    return NextResponse.json({ error: "City is required." }, { status: 400 });
  }
  if (city.length > MAX_CITY_LENGTH) {
    return NextResponse.json({ error: "City name is too long." }, { status: 400 });
  }

  const areaName = typeof body.areaName === "string" ? body.areaName.trim() : "";
  if (areaName.length > MAX_AREA_NAME_LENGTH) {
    return NextResponse.json({ error: "Area name is too long." }, { status: 400 });
  }

  const travelFee = Number(body.travelFeeInr ?? 0);
  if (Number.isNaN(travelFee) || travelFee < 0) {
    return NextResponse.json(
      { error: "Travel Fee must be zero or a positive number." },
      { status: 400 }
    );
  }

  // Accept either a real array or one pasted blob -- the admin form sends
  // whatever the textarea contained, and asking them to format it correctly
  // is exactly the friction this route exists to remove.
  const rawList: string[] = Array.isArray(body.pincodes)
    ? body.pincodes.filter((p): p is string => typeof p === "string")
    : typeof body.pincodes === "string"
      ? body.pincodes.split(/[\s,;]+/)
      : [];

  const seen = new Set<string>();
  const pincodes: string[] = [];
  const invalid: string[] = [];
  for (const raw of rawList) {
    const normalized = normalizePincode(raw);
    if (!normalized) continue;
    if (!isValidPincodeShape(normalized)) {
      invalid.push(raw.trim());
      continue;
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    pincodes.push(normalized);
  }

  if (invalid.length > 0) {
    return NextResponse.json(
      {
        error: `Not a valid 6-digit pincode: ${invalid.slice(0, 5).join(", ")}${
          invalid.length > 5 ? ` (and ${invalid.length - 5} more)` : ""
        }`,
      },
      { status: 400 }
    );
  }
  if (pincodes.length === 0) {
    return NextResponse.json({ error: "Enter at least one pincode." }, { status: 400 });
  }
  if (pincodes.length > MAX_PINCODES_PER_REQUEST) {
    return NextResponse.json(
      { error: `Please add at most ${MAX_PINCODES_PER_REQUEST} pincodes at a time.` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // pincode is unique across the whole table, so a pincode already served
  // (possibly under a different city) must not silently move or duplicate.
  // Report it and let the admin edit that row instead.
  const { data: existing } = await admin
    .from("home_visit_areas")
    .select("pincode")
    .in("pincode", pincodes);

  const alreadyServed = new Set((existing ?? []).map((row) => row.pincode as string));
  const toInsert = pincodes.filter((p) => !alreadyServed.has(p));

  if (toInsert.length === 0) {
    return NextResponse.json(
      { error: "Every pincode in that list is already a service area." },
      { status: 400 }
    );
  }

  const { error } = await admin.from("home_visit_areas").insert(
    toInsert.map((pincode) => ({
      city,
      area_name: areaName || null,
      pincode,
      travel_fee_paise: Math.round(travelFee * 100),
      notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
    }))
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The public page lists the areas served, so it has to reflect a newly
  // opened catchment rather than waiting out its ISR window.
  revalidatePath("/home-visit");

  // Catalog rows decide what is sold and at what price, so every
  // create/update/delete belongs in the same log every other admin
  // action is read from.
  await recordAdminActivity(admin, adminUser.id, {
    action: "catalog.create",
    targetId: null,
    targetLabel: "Service areas",
  });

  return NextResponse.json({
    success: true,
    added: toInsert.length,
    skipped: pincodes.length - toInsert.length,
  });
}

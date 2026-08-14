import { NextRequest, NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import {
  normalizePincode,
  isValidPincodeShape,
  findAreaForPincode,
  type ServiceArea,
} from "@/lib/homeVisitAreas";

// Deliberately public and unauthenticated. Someone who has never used the
// platform has to be able to ask "do you come to my area?" before deciding
// whether to sign up at all -- putting an account behind that question would
// mean asking people to register for a service we may not even offer them.
// home_visit_areas is publicly readable by RLS for exactly this reason, so
// the anon client is enough; no service role needed.
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("pincode");
  const pincode = normalizePincode(raw);

  if (!isValidPincodeShape(pincode)) {
    return NextResponse.json(
      { error: "Enter a valid 6-digit pincode." },
      { status: 400 }
    );
  }

  const supabase = createPublicClient();

  // The master switch is checked here too, not only on the page: with it
  // off there is no service to check against, and answering "yes we serve
  // you" from a stale client would be worse than answering nothing.
  const { data: settingsRow } = await supabase
    .from("site_settings")
    .select("home_visit_enabled")
    .maybeSingle();
  if (settingsRow?.home_visit_enabled !== true) {
    return NextResponse.json(
      { error: "Home visits aren't available right now." },
      { status: 403 }
    );
  }

  const { data: areas } = await supabase
    .from("home_visit_areas")
    .select("id, city, area_name, pincode, travel_fee_paise, active")
    .eq("active", true)
    .eq("pincode", pincode);

  const area = findAreaForPincode((areas ?? []) as ServiceArea[], pincode);

  if (!area) {
    return NextResponse.json({ serviceable: false, pincode });
  }

  return NextResponse.json({
    serviceable: true,
    pincode,
    area: {
      id: area.id,
      city: area.city,
      areaName: area.area_name,
    },
    travelFeePaise: area.travel_fee_paise,
  });
}

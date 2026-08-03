import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/patient/dashboard/:path*",
    "/therapist/dashboard/:path*",
    "/admin/dashboard/:path*",
    "/hospital/dashboard/:path*",
  ],
};

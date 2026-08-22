import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
// One "take me to my dashboard" URL that resolves the role server-side.
//
// The Navbar's Go to Dashboard button and the booking wizard's wrong-account
// card both need to send someone to whichever dashboard is theirs, and both
// are client components -- so mapping role to path in their own code shipped
// the admin dashboard's path in the JavaScript bundle of every public page.
// The route was properly guarded either way (src/proxy.ts, requireAdmin), but
// the back office's address was readable by anyone who opened the bundle.
//
// Resolving here keeps every role's path server-side. It costs one redirect
// hop, which is invisible next to the dashboards' own render.
export const dynamic = "force-dynamic";

// Declared in this server-only file rather than a shared lib module: the
// route helpers next door are imported by Navbar and Footer, so anything
// living there ships to the browser.
const DASHBOARD_HREF_BY_ROLE: Record<string, string> = {
  patient: "/patient/dashboard",
  therapist: "/therapist/dashboard",
  admin: "/admin/dashboard",
  hospital: "/hospital/dashboard",
};

export default async function DashboardRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not signed in: /get-started rather than a login page, since we have no
  // idea which of the four they wanted.
  if (!user) redirect("/get-started");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const base = DASHBOARD_HREF_BY_ROLE[profile?.role ?? ""] ?? "/get-started";

  // Query is carried through so a caller can deep-link into a section (the
  // wrong-account card sends an admin to ?section=sessions). Rebuilt from
  // the parsed params rather than passed through as a raw string, so nothing
  // a caller puts in the URL reaches the redirect uninspected.
  //
  // `hash` is lifted out and re-attached as a real fragment: the admin
  // dashboard navigates by ?section=, but the patient/therapist/hospital
  // shells scroll to an anchor instead, and a fragment cannot survive a
  // round trip as one (the browser never sends it to the server).
  // Constrained to a plain anchor name so this cannot be turned into an
  // open redirect by smuggling a scheme or host through it.
  const params = new URLSearchParams();
  let hash = "";
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value !== "string") continue;
    if (key === "hash") {
      if (/^[a-z0-9-]{1,64}$/i.test(value)) hash = `#${value}`;
      continue;
    }
    params.set(key, value);
  }
  const query = params.toString();

  redirect(`${base}${query ? `?${query}` : ""}${hash}`);
}

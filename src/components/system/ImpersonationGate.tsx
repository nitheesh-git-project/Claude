import { cookies } from "next/headers";
import ImpersonationBanner from "@/components/system/ImpersonationBanner";
import { IMPERSONATION_COOKIE, isExpired, parseMarker } from "@/lib/impersonation";

// A module-level helper rather than a bare Date.now() in the render, the
// same shape the admin dashboard's nowTimestamp() uses: render stays pure.
function nowTimestamp() {
  return Date.now();
}

// Reads the marker server-side and draws the banner above a dashboard.
//
// A layout rather than the shells themselves, and deliberately not the root
// layout: that one is shared with the ISR-cached public pages, and reading a
// cookie there would force every one of them dynamic. The three dashboards
// are per-request already, so this costs nothing where it is.
//
// A marker past its window draws nothing. The proxy is what actually ends
// the session, and it runs on the same request -- but if the two ever
// disagree, a banner saying an expired window is still open is the wrong
// half to keep.
export default async function ImpersonationGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const jar = await cookies();
  const marker = parseMarker(jar.get(IMPERSONATION_COOKIE)?.value);
  const active = marker && !isExpired(marker, nowTimestamp()) ? marker : null;

  return (
    <>
      {active && <ImpersonationBanner marker={active} />}
      {children}
    </>
  );
}

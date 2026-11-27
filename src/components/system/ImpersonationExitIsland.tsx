"use client";

import { useEffect, useState } from "react";
import ImpersonationBanner from "@/components/system/ImpersonationBanner";
import type { ImpersonationMarker } from "@/lib/impersonation";

// The "you are signed in as ..." bar, for a public page. The dashboards draw it
// on the server (ImpersonationGate); a cached page like /book cannot read the
// httpOnly marker, so it asks after load. Without it an admin who followed a
// patient's "Book" link had no Exit and could not get back out of the account.
export default function ImpersonationExitIsland() {
  const [marker, setMarker] = useState<ImpersonationMarker | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/impersonation/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { marker?: ImpersonationMarker | null } | null) => {
        if (alive && d?.marker) setMarker(d.marker);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return marker ? <ImpersonationBanner marker={marker} /> : null;
}

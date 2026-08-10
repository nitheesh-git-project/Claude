"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

// Sends the browser's Back button to the dashboard's "Your Sessions"
// section when the booking page was opened from the patient dashboard.
//
// Back off /book is otherwise whatever happens to be the previous history
// entry, which is not reliably the dashboard the patient started from --
// the dashboard and Edit Profile are two pages behind one shell whose
// sidebar links between them, so a patient who passed through Edit Profile
// on the way lands back there instead of on their sessions. Rather than
// depending on the shape of that history, this pins the destination: one
// Back press from a booking started on the dashboard always returns to the
// sessions list.
//
// It works by pushing a sentinel entry on mount, so the first Back press
// pops back onto /book itself and fires popstate here instead of leaving
// the page; the handler then navigates to the section. Only ever armed for
// ?from=dashboard, so a booking started from the marketing pages keeps the
// browser's normal Back behavior.
export const BOOKING_FROM_DASHBOARD = "/book?from=dashboard";

export default function BookingBackToSessions() {
  const searchParams = useSearchParams();
  const fromDashboard = searchParams.get("from") === "dashboard";

  useEffect(() => {
    if (!fromDashboard) return;

    // history.state is carried through rather than nulled: the App Router
    // keeps its own routing state in there, and replacing it with null
    // leaves the router with nothing to restore on a later popstate.
    window.history.pushState(window.history.state, "", window.location.href);

    function handlePopState() {
      // A hard navigation, matching how this codebase's other cross-shell
      // navigations work (see DashboardShell's nav comment) -- a soft
      // transition into the differently-chromed dashboard route was the
      // thing that silently didn't complete.
      window.location.replace("/patient/dashboard#sessions");
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [fromDashboard]);

  return null;
}

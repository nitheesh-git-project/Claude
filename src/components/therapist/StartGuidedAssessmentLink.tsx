"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { debugNow } from "@/lib/debugNow";
import { useJoinWindow } from "@/lib/joinWindowContext";
import { cockpitHref, offersGuidedAssessment } from "@/lib/guidedAssessmentEntry";

/**
 * "Start guided assessment" on a video session's card. It appears once the
 * session has started (the join window has opened) and stays through a
 * just-finished session, judged on the debug bar's clock like the Join button
 * beside it, so it is decided in the browser after mount and never guessed on
 * the server. The cockpit and its routes make the same check again; this only
 * decides whether the door is shown.
 */
export default function StartGuidedAssessmentLink({
  patientId,
  appointmentId,
  slotTime,
  status,
  noShow,
}: {
  patientId: string;
  appointmentId: string;
  slotTime: string | null;
  status: string;
  noShow: boolean;
}) {
  const { beforeMinutes } = useJoinWindow();
  const [offered, setOffered] = useState(false);
  useEffect(() => {
    const slotTimeMs = slotTime ? new Date(slotTime).getTime() : null;
    const decide = () =>
      setOffered(offersGuidedAssessment({ status, noShow, isHomeVisit: false, slotTimeMs, nowMs: debugNow(), joinWindowMinutes: beforeMinutes }));
    decide();
    const id = window.setInterval(decide, 30_000);
    return () => window.clearInterval(id);
  }, [slotTime, status, noShow, beforeMinutes]);

  if (!offered) return null;
  return (
    <Link
      href={cockpitHref(patientId, appointmentId)}
      data-testid="start-guided-assessment"
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-teal-700 bg-white px-3 text-xs font-semibold text-teal-800 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
    >
      <i className="fa-solid fa-clipboard-check text-[11px]" aria-hidden="true" />
      Start guided assessment
    </Link>
  );
}

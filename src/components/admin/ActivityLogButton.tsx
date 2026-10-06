"use client";

import { useState } from "react";
import Modal from "@/components/admin/Modal";
import ActivityTimeline from "@/components/admin/ActivityTimeline";

/** "View activity" for a profile with no page of its own (a hospital): the
 *  same Activity log a patient's or therapist's profile carries, in a panel. */
export default function ActivityLogButton({ personId, name }: { personId: string; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 transition hover:border-teal-300 hover:text-teal-800"
      >
        <i className="fa-solid fa-clock-rotate-left text-[10px]" aria-hidden="true" />
        View activity
      </button>
      {open && (
        <Modal title={`${name} - activity log`} onClose={() => setOpen(false)}>
          <ActivityTimeline personId={personId} title="Activity log" />
        </Modal>
      )}
    </>
  );
}

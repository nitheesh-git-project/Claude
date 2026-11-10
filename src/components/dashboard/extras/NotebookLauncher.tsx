"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { WithDashboardExtras } from "./DashboardExtrasProvider";

// The editor is the heaviest thing on a dashboard and most visits never
// open the notebook, so it is fetched on the first tap rather than shipped
// with every page.
const NotebookDialog = dynamic(() => import("./NotebookDialog"), { ssr: false });

/**
 * The notebook's floating button: a small closed notebook in the corner of
 * every dashboard screen, above the phone's tab bar.
 *
 * Drawn from boxes rather than an icon, on purpose -- it is the cover of the
 * thing it opens (same colour, same band, same ribbon), so the opening
 * animation reads as that object getting bigger and then being opened.
 * Literal colours throughout: a notebook is teal with cream pages whatever
 * the dashboard's own theme is doing.
 *
 * Not rendered while an admin is signed in as the person (the gate says so):
 * a notebook is private to its owner, so the admin is not offered a button
 * that could only refuse them.
 */
export default function NotebookLauncher() {
  return (
    <WithDashboardExtras
      render={(extras) =>
        extras.notebook.enabled ? <Launcher ownerFirstName={extras.notebook.ownerFirstName} /> : null
      }
    />
  );
}

function Launcher({ ownerFirstName }: { ownerFirstName: string | null }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open my notebook"
        aria-haspopup="dialog"
        title="My notebook"
        data-testid="notebook-button"
        className="group fixed bottom-[calc(1rem+var(--app-bottom-inset,0px))] right-4 z-30 block h-[72px] w-[60px] -rotate-6 transition-transform duration-200 hover:-rotate-2 hover:scale-105 focus-visible:outline-none active:scale-95 print:hidden sm:right-6 lg:bottom-8 lg:right-8 lg:h-[88px] lg:w-[72px]"
      >
        {/* page edges */}
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-[10%] right-0 top-[4%] rounded-[4px_10px_10px_4px] border border-[#d6cfbd] bg-[#fbf7ec]"
        ></span>
        {/* cover */}
        <span
          aria-hidden="true"
          className="absolute bottom-[3%] left-0 right-[6%] top-0 rounded-[5px_11px_11px_5px] bg-[#0f766e] shadow-[0_10px_20px_rgba(15,23,42,0.30),0_2px_4px_rgba(15,23,42,0.20)] ring-teal-300 group-focus-visible:ring-4"
        ></span>
        {/* spine */}
        <span
          aria-hidden="true"
          className="absolute bottom-[3%] left-0 top-0 w-[15%] rounded-l-[5px] bg-[#115e59]"
        ></span>
        {/* elastic band */}
        <span aria-hidden="true" className="absolute bottom-[3%] left-[70%] top-0 w-[8%] bg-[#134e4a]"></span>
        {/* label */}
        <span
          aria-hidden="true"
          className="absolute left-[25%] top-[22%] flex h-[22%] w-[37%] flex-col justify-center gap-[3px] rounded-[3px] bg-[#fbf7ec] px-[3px]"
        >
          <span className="h-[2px] rounded-full bg-[#94a3b8]"></span>
          <span className="h-[2px] w-1/2 rounded-full bg-[#94a3b8]"></span>
        </span>
        {/* ribbon */}
        <span aria-hidden="true" className="absolute -bottom-[10%] left-[40%] h-[16%] w-[12%] bg-[#d97706]"></span>
      </button>
      {open && (
        <NotebookDialog ownerFirstName={ownerFirstName} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

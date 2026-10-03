"use client";

import { useId, useOptimistic, useState, useTransition } from "react";
import PagedList from "@/components/dashboard/PagedList";
import { useConfirm } from "@/lib/useConfirm";
import { useRouter } from "@/lib/useRouter";
import { useSaveSetting } from "@/lib/useSaveSetting";
import { useToast } from "@/lib/toast";
import { formatClinicDateTime } from "@/lib/formatDateTime";
import {
  EMAIL_RE,
  MAX_DEV_REACHOUT_EMAIL_LENGTH,
  MAX_DEV_REACHOUT_NOTE_LENGTH,
  type DevReachoutStatus,
} from "@/lib/devReachout";

export type DevReachoutRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  status: DevReachoutStatus;
  admin_note: string | null;
  note_updated_at: string | null;
  contacted_at: string | null;
  created_at: string;
};

// The developer's own inbox: whatever was left through "Contact me" under the
// footer, and the two settings that publish that page. Settings is Master
// Admin only, so neither the rows nor these controls reach a scoped admin
// (the dashboard does not even read the table for one).
export default function DevReachoutsTab({
  reachouts,
  devContactEnabled,
  devContactEmail,
}: {
  reachouts: DevReachoutRow[];
  devContactEnabled: boolean;
  devContactEmail: string;
}) {
  return (
    <div className="space-y-6">
      <ContactSettingsCard enabled={devContactEnabled} email={devContactEmail} />

      <section
        aria-label="Dev reachouts"
        className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6"
      >
        <h2 className="font-display font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
          Messages
          {reachouts.filter((r) => r.status === "new").length > 0 && (
            <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
              {reachouts.filter((r) => r.status === "new").length} new
            </span>
          )}
        </h2>
        {reachouts.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            No messages yet. When someone uses Contact me in the footer, what they write will
            show up here.
          </p>
        ) : (
          <PagedList
            noun="message"
            storageKey="admin-dev-reachouts"
            className="space-y-3"
            filterLabel="Filter dev reachouts"
            filters={[
              { key: "new", label: "New" },
              { key: "contacted", label: "Contacted" },
            ]}
            items={reachouts.map((row) => ({
              id: row.id,
              group: row.status,
              node: <ReachoutCard row={row} />,
            }))}
          />
        )}
      </section>
    </div>
  );
}

function ContactSettingsCard({ enabled, email }: { enabled: boolean; email: string }) {
  const saveSetting = useSaveSetting();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const emailId = useId();
  const emailHelpId = `${emailId}-help`;

  const [optimisticEnabled, setOptimisticEnabled] = useOptimistic(enabled);
  const [isTogglePending, startToggleTransition] = useTransition();
  const [toggleError, setToggleError] = useState<string | null>(null);

  const [emailInput, setEmailInput] = useState(email);
  const [isEmailSaving, setIsEmailSaving] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  // The dialog is awaited BEFORE the transition starts, never inside it: the
  // dialog is itself a state update, and one awaited inside the transition it
  // is waiting on never paints. Cancelling returns here and nothing has
  // changed -- the switch is only flipped once the answer is yes.
  async function handleToggle() {
    const next = !optimisticEnabled;
    const ok = await confirm(
      next
        ? "Show the developer credit? The footer line and the /developer pages go live for every visitor."
        : "Hide the developer credit? The footer line disappears and /developer stops opening. Reachouts already received stay here."
    );
    if (!ok) return;
    setToggleError(null);
    startToggleTransition(async () => {
      setOptimisticEnabled(next);
      try {
        await saveSetting("dev_contact_enabled", next);
        router.refresh();
      } catch (e) {
        setToggleError(e instanceof Error ? e.message : "Could not save. Please try again.");
      }
    });
  }

  async function handleSaveEmail() {
    const trimmed = emailInput.trim();
    if (trimmed !== "" && (trimmed.length > MAX_DEV_REACHOUT_EMAIL_LENGTH || !EMAIL_RE.test(trimmed))) {
      setEmailError("Please enter a valid email address, or leave it blank to hide it.");
      return;
    }
    setEmailError(null);
    setIsEmailSaving(true);
    try {
      await saveSetting("dev_contact_email", trimmed);
      setEmailInput(trimmed);
    } catch (e) {
      setEmailError(e instanceof Error ? e.message : "Could not save. Please try again.");
      return;
    } finally {
      setIsEmailSaving(false);
    }
    router.refresh();
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="max-w-md">
          <h3 className="font-bold text-sm text-slate-800">
            Show the developer credit and contact page
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            {"The line under the footer's copyright, and the Say hello and Let's talk pages it leads to. Switched off, the line disappears and those pages stop opening. Messages already received stay on this screen."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={optimisticEnabled}
          onClick={handleToggle}
          disabled={isTogglePending}
          className={`text-xs font-semibold px-4 py-2 rounded-lg transition disabled:opacity-60 ${
            optimisticEnabled
              ? "bg-teal-700 hover:bg-teal-800 text-white"
              : "bg-slate-200 hover:bg-slate-300 text-slate-800"
          }`}
        >
          {isTogglePending ? "Saving…" : optimisticEnabled ? "Shown" : "Hidden"}
          <span className="sr-only"> Show the developer credit and contact page</span>
        </button>
      </div>
      {toggleError && <p className="text-[11px] text-red-600 -mt-4">{toggleError}</p>}

      <div className="max-w-md">
        <label htmlFor={emailId} className="block text-xs font-semibold text-slate-700 mb-1">
          {"Email shown on the Let's talk page"}
        </label>
        <div className="flex gap-2">
          <input
            id={emailId}
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            maxLength={MAX_DEV_REACHOUT_EMAIL_LENGTH}
            autoComplete="off"
            placeholder="name@example.com"
            aria-describedby={emailHelpId}
            aria-invalid={emailError ? true : undefined}
            className="w-full p-2.5 rounded-lg border border-slate-300 text-xs"
          />
          <button
            type="button"
            onClick={handleSaveEmail}
            disabled={isEmailSaving || emailInput.trim() === email}
            className="shrink-0 bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-lg transition"
          >
            {isEmailSaving ? "Saving…" : "Save"}
          </button>
        </div>
        <p id={emailHelpId} className="text-[11px] text-slate-500 mt-1">
          {'Leave it blank to hide the "Prefer email?" line. The form works either way.'}
        </p>
        {emailError && <p className="text-[11px] text-red-600 mt-1">{emailError}</p>}
      </div>
      {dialog}
    </div>
  );
}

function ReachoutCard({ row }: { row: DevReachoutRow }) {
  const router = useRouter();
  const { show } = useToast();
  const noteId = useId();

  const [optimisticStatus, setOptimisticStatus] = useOptimistic<DevReachoutStatus>(row.status);
  const [isStatusPending, startStatusTransition] = useTransition();
  const [statusError, setStatusError] = useState<string | null>(null);

  const [note, setNote] = useState(row.admin_note ?? "");
  const [isNoteSaving, setIsNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const contacted = optimisticStatus === "contacted";

  function handleToggleStatus() {
    const next: DevReachoutStatus = contacted ? "new" : "contacted";
    setStatusError(null);
    startStatusTransition(async () => {
      setOptimisticStatus(next);
      try {
        const res = await fetch("/api/admin/update-dev-reachout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: row.id, status: next }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Could not update. Please try again.");
        show(
          next === "contacted"
            ? `${row.name} is marked as contacted`
            : `${row.name} is back in new`
        );
        router.refresh();
      } catch (e) {
        setStatusError(
          e instanceof Error && e.message
            ? e.message
            : "Could not reach the server. Nothing was saved."
        );
      }
    });
  }

  async function handleSaveNote() {
    setNoteError(null);
    setIsNoteSaving(true);
    try {
      const res = await fetch("/api/admin/update-dev-reachout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not save the note. Please try again.");
      show(`Note saved for ${row.name}`);
    } catch (e) {
      setNoteError(
        e instanceof Error && e.message
          ? e.message
          : "Could not reach the server. Nothing was saved."
      );
      return;
    } finally {
      setIsNoteSaving(false);
    }
    router.refresh();
  }

  return (
    <div className="p-4 rounded-xl border border-slate-200 text-xs space-y-3">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <p className="font-bold text-slate-900">{row.name}</p>
          <p className="text-slate-500 mt-0.5">{formatClinicDateTime(row.created_at)}</p>
        </div>
        <span
          className={`font-semibold px-3 py-1 rounded-full ${
            contacted ? "text-teal-700 bg-teal-50" : "text-amber-700 bg-amber-100"
          }`}
        >
          {contacted
            ? row.contacted_at
              ? `Contacted ${formatClinicDateTime(row.contacted_at)}`
              : "Contacted"
            : "New"}
        </span>
      </div>

      <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1.5">
        <dt className="font-semibold text-slate-500">Email</dt>
        <dd className="text-slate-800 break-all">
          <a href={`mailto:${row.email}`} className="text-teal-700 hover:underline">
            {row.email}
          </a>
        </dd>
        {row.phone && (
          <>
            <dt className="font-semibold text-slate-500">Phone</dt>
            <dd className="text-slate-800">
              <a href={`tel:${row.phone}`} className="text-teal-700 hover:underline">
                {row.phone}
              </a>
            </dd>
          </>
        )}
        <dt className="font-semibold text-slate-500">Message</dt>
        <dd className="whitespace-pre-wrap break-words text-slate-800">{row.message}</dd>
      </dl>

      <div>
        <label htmlFor={noteId} className="block font-semibold text-slate-500 mb-1">
          Your note
        </label>
        <textarea
          id={noteId}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={MAX_DEV_REACHOUT_NOTE_LENGTH}
          placeholder="Only you can see this."
          className="w-full p-2.5 rounded-lg border border-slate-300"
        />
        {noteError && <p className="text-[11px] text-red-600 mt-1">{noteError}</p>}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={handleToggleStatus}
          disabled={isStatusPending}
          className={`font-semibold px-3 py-2 rounded-lg transition disabled:opacity-60 ${
            contacted
              ? "bg-slate-200 hover:bg-slate-300 text-slate-800"
              : "bg-teal-700 hover:bg-teal-800 text-white"
          }`}
        >
          {isStatusPending ? "Saving…" : contacted ? "Move back to new" : "Mark as contacted"}
        </button>
        <button
          type="button"
          onClick={handleSaveNote}
          disabled={isNoteSaving || note.trim() === (row.admin_note ?? "")}
          className="font-semibold px-3 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 disabled:opacity-60 text-slate-800 transition"
        >
          {isNoteSaving ? "Saving…" : "Save note"}
        </button>
        {statusError && <span className="text-[11px] text-red-600">{statusError}</span>}
      </div>
    </div>
  );
}

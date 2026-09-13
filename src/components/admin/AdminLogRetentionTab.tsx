"use client";

import { useRef, useState, type ReactNode } from "react";
import DataExportButtons from "@/components/admin/DataExportButtons";
import Spinner from "@/components/system/Spinner";
import { useRouter } from "@/lib/useRouter";
import type { ActivityRow } from "@/components/admin/AdminActivityLogTab";
import { describeAction } from "@/components/admin/ActivityDetailDialog";
import {
  CLEAR_CONFIRM_PHRASE,
  MIN_RETENTION_DAYS,
  RETENTION_CHOICES,
  activityCategory,
  activityCategoryLabel,
} from "@/lib/activityLog";
import type { CsvColumn } from "@/lib/csvExport";

// Taking old entries out of the audit trail -- the only way a row ever
// leaves it.
//
// The screen is deliberately four steps rather than a button. This is the
// one irreversible control in the back office that destroys evidence rather
// than data somebody can recreate, so each step exists to make a particular
// mistake impossible:
//
//  1. **Choose a cutoff** from a fixed set. A free-form number field invites
//     a typo in the one place a typo deletes history, and nothing under
//     MIN_RETENTION_DAYS is offered here or accepted by the route or the
//     database function behind it.
//  2. **See the count first.** Counted server-side, because this screen
//     holds only the newest page and a browser-side count would understate
//     what is about to go.
//  3. **Download a copy.** The Clear button stays locked until a download
//     has actually been produced -- not a checkbox saying one was, which is
//     a promise rather than a fact. A record that is gone and was never kept
//     is destroyed; one that was downloaded first has only been moved.
//  4. **Type the phrase.** The same shape the data reset uses. A
//     confirmation somebody can click through is not a confirmation.
//
// And the clearing is itself logged, outside its own reach: the entry is
// written now, and now is inside the protected window, so a clear can never
// remove the record of a clear.

// Fifty pages of the read route's own 200, so ten thousand entries. Beyond
// that an archive is not something to build in a browser tab, and the screen
// says so rather than silently handing back a short file.
const ARCHIVE_PAGE_LIMIT = 50;
const ARCHIVE_MAX_ENTRIES = ARCHIVE_PAGE_LIMIT * 200;

export default function AdminLogRetentionTab() {
  const router = useRouter();
  const [days, setDays] = useState<number>(365);
  const [preview, setPreview] = useState<{ days: number; count: number; cutoff: string } | null>(
    null
  );
  const [archive, setArchive] = useState<{ days: number; rows: ActivityRow[] } | null>(null);
  const [exported, setExported] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState<null | "preview" | "archive" | "clear">(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // Synchronous, because a `disabled` attribute lands a render too late and
  // a double-tapped Clear would run the purge twice.
  const busyRef = useRef(false);

  // Changing the cutoff invalidates everything downstream: a count and an
  // archive taken for one year must not unlock a clear at three months.
  function chooseDays(next: number) {
    setDays(next);
    setPreview(null);
    setArchive(null);
    setExported(false);
    setPhrase("");
    setError(null);
    setDone(null);
  }

  async function run<T>(kind: "preview" | "archive" | "clear", fn: () => Promise<T>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  const checkCount = () =>
    run("preview", async () => {
      const res = await fetch("/api/admin/clear-activity-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "preview", olderThanDays: days }),
      });
      const body = (await res.json()) as { count?: number; cutoff?: string; error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not check the log.");
        return;
      }
      setPreview({ days, count: body.count ?? 0, cutoff: body.cutoff ?? "" });
    });

  const buildArchive = () =>
    run("archive", async () => {
      // Paged through the same read route the log screen uses, oldest-first
      // by cursor. Capped: an archive that cannot be held in a browser tab
      // is one the clinic should be taking out of the database directly, and
      // a loop with no ceiling on a table that grows forever is how a screen
      // hangs.
      const rows: ActivityRow[] = [];
      let before: string | undefined = preview?.cutoff;
      for (let page = 0; page < ARCHIVE_PAGE_LIMIT; page += 1) {
        const res: Response = await fetch("/api/admin/activity-log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ before }),
        });
        const body = (await res.json()) as {
          rows?: ActivityRow[];
          hasMore?: boolean;
          error?: string;
        };
        if (!res.ok) {
          setError(body.error ?? "Could not read the log.");
          return;
        }
        const incoming = body.rows ?? [];
        rows.push(...incoming);
        if (!body.hasMore || incoming.length === 0) break;
        before = incoming[incoming.length - 1].createdAt;
      }
      setArchive({ days, rows });
      setExported(false);
    });

  const clear = () =>
    run("clear", async () => {
      const res = await fetch("/api/admin/clear-activity-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ olderThanDays: days, confirm: phrase.trim() }),
      });
      const body = (await res.json()) as { removed?: number; error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not clear the log.");
        return;
      }
      setDone(
        `${body.removed ?? 0} ${body.removed === 1 ? "entry" : "entries"} cleared. The clearing itself is in the log.`
      );
      setPreview(null);
      setArchive(null);
      setExported(false);
      setPhrase("");
      router.refresh();
    });

  const archiveColumns: CsvColumn<ActivityRow>[] = [
    { header: "When", value: (r) => r.createdAt },
    { header: "Admin", value: (r) => r.actorName },
    { header: "Category", value: (r) => activityCategoryLabel(activityCategory(r.action)) },
    { header: "Action", value: (r) => describeAction(r.action) },
    { header: "Subject", value: (r) => r.targetLabel ?? "" },
    {
      header: "Amount (INR)",
      value: (r) => (r.amountPaise != null ? (r.amountPaise / 100).toFixed(2) : ""),
    },
    { header: "Details", value: (r) => (r.details ? JSON.stringify(r.details) : "") },
  ];

  const countedForThis = preview?.days === days ? preview : null;
  const archivedForThis = archive?.days === days ? archive : null;
  const canClear =
    !!countedForThis &&
    countedForThis.count > 0 &&
    exported &&
    phrase.trim() === CLEAR_CONFIRM_PHRASE &&
    busy === null;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-display text-lg font-bold text-slate-800">Archive &amp; Clear</h2>
        <p className="mt-1 text-xs text-slate-500">
          The log keeps every action for ever unless you clear it. Clearing removes
          entries older than a cutoff you choose, and never anything from the last{" "}
          {MIN_RETENTION_DAYS} days - so the record of what happened recently, including
          this clearing, cannot be removed by it.
        </p>

        {done && (
          <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-800">
            {done}
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
            {error}
          </p>
        )}

        <ol className="mt-5 space-y-4">
          <Step n={1} title="Choose how far back to keep">
            <div className="flex flex-wrap items-center gap-2">
              {RETENTION_CHOICES.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  onClick={() => chooseDays(choice)}
                  aria-pressed={days === choice}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                    days === choice
                      ? "border-teal-500 bg-teal-50 text-teal-800"
                      : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Older than {choice} days
                </button>
              ))}
            </div>
          </Step>

          <Step n={2} title="See what that would clear">
            <button
              type="button"
              onClick={checkCount}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              {busy === "preview" && <Spinner />}
              Count them
            </button>
            {countedForThis && (
              <p className="mt-2 text-xs text-slate-600">
                <strong className="font-semibold text-slate-800">
                  {countedForThis.count.toLocaleString("en-IN")}
                </strong>{" "}
                {countedForThis.count === 1 ? "entry is" : "entries are"} older than {days} days.
                {countedForThis.count === 0 && " There is nothing to clear."}
              </p>
            )}
          </Step>

          <Step n={3} title="Download a copy first">
            {!countedForThis || countedForThis.count === 0 ? (
              <p className="text-xs text-slate-400">Count them first.</p>
            ) : !archivedForThis ? (
              <button
                type="button"
                onClick={buildArchive}
                disabled={busy !== null}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {busy === "archive" && <Spinner />}
                Prepare the archive
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-slate-600">
                  {archivedForThis.rows.length.toLocaleString("en-IN")} entries ready.
                  {archivedForThis.rows.length < countedForThis.count && (
                    <>
                      {" "}
                      That is fewer than the {countedForThis.count.toLocaleString("en-IN")}{" "}
                      counted - this screen fetches at most{" "}
                      {ARCHIVE_MAX_ENTRIES.toLocaleString("en-IN")} entries at a
                      time. Clear in smaller steps, or take a copy from the database.
                    </>
                  )}
                </p>
                <DataExportButtons
                  filename={`admin-logs-before-${days}-days`}
                  title="Admin activity log - archive"
                  subtitle={`Every entry older than ${days} days, as at the moment this was prepared.`}
                  rows={archivedForThis.rows}
                  columns={archiveColumns}
                  onExported={() => setExported(true)}
                />
                <p className="text-[11px] text-slate-400">
                  {exported
                    ? "Copy downloaded. You can clear these entries now."
                    : "Download one of these before the Clear button unlocks."}
                </p>
              </div>
            )}
          </Step>

          <Step n={4} title="Clear them">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                placeholder={CLEAR_CONFIRM_PHRASE}
                aria-label={`Type ${CLEAR_CONFIRM_PHRASE} to confirm`}
                className="rounded-lg border border-slate-300 bg-white p-2 text-xs"
              />
              <button
                type="button"
                onClick={clear}
                disabled={!canClear}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy === "clear" && <Spinner />}
                Clear entries older than {days} days
              </button>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Type {CLEAR_CONFIRM_PHRASE} to confirm. This cannot be undone, and the
              clearing is recorded in the log with the cutoff and the number removed.
            </p>
          </Step>
        </ol>
      </div>
    </div>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-700">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[10px] text-slate-700">
          {n}
        </span>
        {title}
      </p>
      {children}
    </li>
  );
}

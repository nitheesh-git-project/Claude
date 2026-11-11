"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { motion } from "motion/react";
import OverlayPortal from "@/components/system/OverlayPortal";
import RichTextEditor from "@/components/RichTextEditor";
import RichTextView from "@/components/RichTextView";
import { useDialogChrome } from "@/lib/useDialogChrome";
import { useConfirm } from "@/lib/useConfirm";
import { useToast } from "@/lib/toast";
import { useUnloadWarning } from "@/lib/useUnloadWarning";
import { formatClinicDateLong, formatClinicDateShort } from "@/lib/formatDateTime";
import { parseRichText, sanitizeRichDoc, serializeRichText } from "@/lib/richText";
import { NOTEBOOK_AUTOSAVE_MS, notebookPagePreview } from "@/lib/notebook";
import { notebookHand } from "./notebookFont";

/**
 * The notebook, open.
 *
 * A diary rather than a document list: pages in the order they were
 * started, each dated at the top, one in front of you at a time. On a phone
 * it is a single page under a row of binder rings; from `lg` it is an open
 * book -- the page before on the left, the page being written on the right.
 *
 * **It opens like a book.** The cover (the same one the floating button
 * draws) turns on its spine, or lifts on its rings on a phone, and the page
 * is underneath. The turning leaf is scenery only: once it has turned it is
 * removed and the pages are ordinary flat elements, so nothing a person
 * types into ever sits on a 3D-transformed face (which is where browsers
 * blur text and lose clicks). Under "reduce motion" there is no leaf at all.
 *
 * **It saves itself.** A moment after the last keystroke, and again before
 * a page turn and before closing; the footer says which state it is in, and
 * a save that failed is retried rather than dropped. The page is never
 * re-read from the server while it is open, so nothing overwrites what is
 * being typed.
 *
 * Private by construction: everything here talks to /api/notebook, which
 * only ever answers for the signed-in person's own pages.
 */

type PageMeta = { id: string; created_at: string; updated_at: string; preview: string };
type Body = { status: "loading" } | { status: "ready"; value: string | null } | { status: "error" };
type SaveState = "idle" | "saving" | "saved" | "error";

const PAPER = "#fbf7ec";
const INK = "#1f2a44";

// Ruled lines every 30px, scrolling with the writing rather than with the
// box. An inline style because the gradient is one long value that has no
// business being a class name.
const RULED: CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(to bottom, transparent 0px, transparent 29px, #d9d2bf 29px, #d9d2bf 30px)",
  backgroundAttachment: "local",
};

// The writing area. Every line is 30px so text sits on the rules; a table
// is the one thing that cannot (its borders add a pixel a row), so it gets
// the paper's own background and reads as a card laid on the page.
const WRITING = [
  "min-h-[14rem] pb-10 text-[16px] leading-[30px] outline-none break-words",
  "[&_p]:min-h-[30px]",
  "[&_h2]:[font-family:var(--font-notebook)] [&_h2]:text-[25px] [&_h2]:font-bold [&_h2]:leading-[30px]",
  "[&_h3]:text-[16px] [&_h3]:font-bold [&_h3]:leading-[30px]",
  "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-[#b9b199] [&_blockquote]:pl-3 [&_blockquote]:italic",
  "[&_a]:text-[#0f766e] [&_a]:underline [&_a]:underline-offset-2",
  "[&_.tableWrapper]:max-w-full [&_.tableWrapper]:overflow-x-auto",
  "[&_table]:w-full [&_table]:border-collapse [&_table]:bg-[#fbf7ec] [&_table]:text-[15px]",
  "[&_td]:min-w-[4rem] [&_td]:border [&_td]:border-[#b9b199] [&_td]:px-2 [&_td]:align-top [&_td]:leading-[29px]",
  "[&_th]:min-w-[4rem] [&_th]:border [&_th]:border-[#b9b199] [&_th]:bg-[#f1ead7] [&_th]:px-2 [&_th]:text-left [&_th]:font-bold [&_th]:leading-[29px]",
  "[&_.selectedCell]:bg-[#e3f4ef]",
  "[&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]",
  "[&_p.is-editor-empty:first-child]:before:text-[#8a836f]",
  "[&_p.is-editor-empty:first-child]:before:float-left",
  "[&_p.is-editor-empty:first-child]:before:h-0",
  "[&_p.is-editor-empty:first-child]:before:pointer-events-none",
].join(" ");

// The same rhythm for a page shown read-only (the left page of the spread).
const READING =
  "text-[16px] leading-[30px] !space-y-0 [&_h3]:[font-family:var(--font-notebook)] [&_h3]:text-[25px] [&_h3]:leading-[30px] [&_h4]:text-[16px] [&_h4]:leading-[30px] [&_li]:!space-y-0 [&_ul]:!space-y-0 [&_ol]:!space-y-0 [&_table]:bg-[#fbf7ec]";

async function api<T>(init?: { body?: unknown; query?: string; keepalive?: boolean }): Promise<T | null> {
  try {
    const res = await fetch(`/api/notebook${init?.query ?? ""}`, {
      method: init?.body ? "POST" : "GET",
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      keepalive: init?.keepalive,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The cover, drawn large: the floating button's own design. */
function Cover({ title, vertical }: { title: string; vertical: boolean }) {
  return (
    <span className="absolute inset-0 block overflow-hidden rounded-[inherit] bg-[#0f766e]">
      {vertical ? (
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[7%] bg-[#115e59]"></span>
      ) : (
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[7%] bg-[#115e59]"></span>
      )}
      <span aria-hidden="true" className="absolute inset-y-0 right-[14%] w-[5%] bg-[#134e4a]"></span>
      <span className="absolute left-1/2 top-[30%] flex w-[62%] -translate-x-1/2 flex-col items-center gap-1 rounded-lg border-2 border-[#d6cfbd] bg-[#fbf7ec] px-3 py-4 text-center">
        <span className={`${notebookHand.className} text-[34px] font-bold leading-tight text-[#0f766e]`}>
          {title}
        </span>
      </span>
    </span>
  );
}

export default function NotebookDialog({
  ownerFirstName,
  onClose,
}: {
  ownerFirstName: string | null;
  onClose: () => void;
}) {
  const titleId = useId();
  const title = ownerFirstName ? `${ownerFirstName}’s notebook` : "My notebook";
  const { show } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [pages, setPages] = useState<PageMeta[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [bodies, setBodies] = useState<Record<string, Body>>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [showIndex, setShowIndex] = useState(false);
  const [turn, setTurn] = useState<1 | -1>(1);
  const [busy, setBusy] = useState(false);
  // The opening: "cover" (closed) -> "turning" -> "open" (flat pages).
  const [stage, setStage] = useState<"cover" | "turning" | "open">(() =>
    prefersReducedMotion() ? "open" : "cover"
  );

  const pending = useRef<{ id: string; json: unknown } | null>(null);
  const timer = useRef<number | null>(null);
  const saving = useRef<Promise<boolean> | null>(null);
  const closing = useRef(false);

  useUnloadWarning(saveState === "saving" || saveState === "error");

  // ---- saving ------------------------------------------------------------

  const flush = useCallback(async (keepalive = false): Promise<boolean> => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    // One save at a time: a second flush waits for the first, then sends
    // whatever was typed meanwhile.
    if (saving.current) await saving.current;
    const job = pending.current;
    if (!job) return true;
    pending.current = null;
    setSaveState("saving");
    const run = (async () => {
      const result = await api<{ success: true; updated_at: string }>({
        body: { action: "save", id: job.id, content: job.json },
        keepalive,
      });
      if (!result) {
        // Keep it to send again, unless something newer is already waiting.
        if (!pending.current) pending.current = job;
        setSaveState("error");
        return false;
      }
      const stored = serializeRichText(sanitizeRichDoc(job.json, { tables: true }));
      setBodies((prev) => ({ ...prev, [job.id]: { status: "ready", value: stored } }));
      setPages((prev) =>
        prev
          ? prev.map((p) =>
              p.id === job.id ? { ...p, updated_at: result.updated_at, preview: notebookPagePreview(stored) } : p
            )
          : prev
      );
      setSaveState(pending.current ? "saving" : "saved");
      return true;
    })();
    saving.current = run;
    const ok = await run;
    saving.current = null;
    return ok;
  }, []);

  // A failed save is tried again by itself: the person should not have to
  // notice a footer to keep what they wrote.
  useEffect(() => {
    if (saveState !== "error") return;
    const retry = window.setTimeout(() => void flush(), 5000);
    return () => window.clearTimeout(retry);
  }, [saveState, flush]);

  const onEdit = useCallback(
    (id: string, json: unknown) => {
      pending.current = { id, json };
      setSaveState("saving");
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), NOTEBOOK_AUTOSAVE_MS);
    },
    [flush]
  );

  // ---- loading -----------------------------------------------------------

  const loadBody = useCallback(async (id: string) => {
    setBodies((prev) => (prev[id]?.status === "ready" ? prev : { ...prev, [id]: { status: "loading" } }));
    const result = await api<{ page: { id: string; body: string | null } }>({ query: `?page=${id}` });
    setBodies((prev) => {
      if (prev[id]?.status === "ready") return prev;
      return { ...prev, [id]: result ? { status: "ready", value: result.page.body } : { status: "error" } };
    });
  }, []);

  const load = useCallback(async () => {
    setLoadFailed(false);
    const listed = await api<{ pages: PageMeta[] }>();
    if (!listed) {
      setLoadFailed(true);
      return;
    }
    let all = listed.pages;
    if (all.length === 0) {
      // A notebook nobody has written in still opens on a page.
      const created = await api<{ page: { id: string; created_at: string; updated_at: string } }>({
        body: { action: "create" },
      });
      if (!created) {
        setLoadFailed(true);
        return;
      }
      all = [{ ...created.page, preview: "" }];
      setBodies({ [created.page.id]: { status: "ready", value: null } });
    }
    setPages(all);
    setCurrentId(all[all.length - 1].id);
  }, []);

  useEffect(() => {
    // Fetched once when the notebook opens; state is set from the awaited
    // result, not synchronously in the effect.
    const start = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(start);
  }, [load]);

  const index = pages && currentId ? pages.findIndex((p) => p.id === currentId) : -1;
  const page = index >= 0 && pages ? pages[index] : null;
  const previous = index > 0 && pages ? pages[index - 1] : null;
  const currentBody = currentId ? bodies[currentId] : undefined;
  const previousBody = previous ? bodies[previous.id] : undefined;

  useEffect(() => {
    if (!currentId) return;
    const wanted = [currentId, previous?.id].filter((id): id is string => !!id);
    const start = window.setTimeout(() => {
      for (const id of wanted) void loadBody(id);
    }, 0);
    return () => window.clearTimeout(start);
    // `bodies` is deliberately not a dependency: loadBody skips what is ready.
  }, [currentId, previous?.id, loadBody]);

  // ---- the opening -------------------------------------------------------

  useEffect(() => {
    if (stage !== "cover") return;
    const begin = window.setTimeout(() => setStage("turning"), 260);
    return () => window.clearTimeout(begin);
  }, [stage]);

  useEffect(() => {
    if (stage !== "turning") return;
    const done = window.setTimeout(() => setStage("open"), 1000);
    return () => window.clearTimeout(done);
  }, [stage]);

  // ---- actions -----------------------------------------------------------

  const close = useCallback(async () => {
    if (closing.current) return;
    closing.current = true;
    const ok = await flush(true);
    if (!ok) {
      const leave = await confirm(
        "Your last changes on this page could not be saved. If you close the notebook now, they will be lost.",
        { confirmLabel: "Close anyway", cancelLabel: "Keep it open" }
      );
      if (!leave) {
        closing.current = false;
        return;
      }
    }
    onClose();
  }, [flush, confirm, onClose]);

  const { panelRef, dialogProps } = useDialogChrome({ onClose: () => void close(), labelledBy: titleId });

  async function goTo(id: string) {
    if (!pages || id === currentId || busy) return;
    setBusy(true);
    await flush();
    const from = index;
    const to = pages.findIndex((p) => p.id === id);
    setTurn(to >= from ? 1 : -1);
    setCurrentId(id);
    setShowIndex(false);
    setBusy(false);
  }

  async function newPage() {
    if (!pages || busy) return;
    setBusy(true);
    await flush();
    const last = pages[pages.length - 1];
    const lastIsEmpty = last.preview === "" && !(pending.current && pending.current.id === last.id);
    if (lastIsEmpty) {
      // One blank page at the end is enough; a second would only be a page
      // to delete later.
      if (last.id === currentId) show("This page is still empty. Write here first.", "info");
      else {
        setTurn(1);
        setCurrentId(last.id);
        setShowIndex(false);
      }
      setBusy(false);
      return;
    }
    const created = await api<{ page: { id: string; created_at: string; updated_at: string } }>({
      body: { action: "create" },
    });
    if (!created) {
      show("A new page couldn't be added just now. Please try again.", "error");
      setBusy(false);
      return;
    }
    setBodies((prev) => ({ ...prev, [created.page.id]: { status: "ready", value: null } }));
    setPages([...pages, { ...created.page, preview: "" }]);
    setTurn(1);
    setCurrentId(created.page.id);
    setShowIndex(false);
    setBusy(false);
  }

  async function deletePage() {
    if (!pages || !page || busy) return;
    const sure = await confirm(
      `Delete page ${index + 1}? What is written on it will be gone for good.`,
      { confirmLabel: "Delete page", cancelLabel: "Keep it" }
    );
    if (!sure) return;
    setBusy(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    if (pending.current?.id === page.id) pending.current = null;
    const result = await api<{ success: true }>({ body: { action: "delete", id: page.id } });
    if (!result) {
      show("That page couldn't be deleted just now. Please try again.", "error");
      setBusy(false);
      return;
    }
    const rest = pages.filter((p) => p.id !== page.id);
    if (rest.length === 0) {
      setPages(null);
      setCurrentId(null);
      setBusy(false);
      setSaveState("idle");
      await load();
      return;
    }
    setPages(rest);
    setTurn(-1);
    setCurrentId(rest[Math.min(index, rest.length - 1)].id);
    setSaveState("idle");
    setBusy(false);
  }

  const initialDoc = useMemo(
    () =>
      currentBody?.status === "ready" ? parseRichText(currentBody.value, { tables: true }) : null,
    // Re-made per page only: while a page is open the editor owns the text,
    // and rebuilding its document on every save would move the cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentId, currentBody?.status]
  );

  const saveLabel =
    saveState === "saving"
      ? "Saving…"
      : saveState === "error"
        ? "Not saved yet. Trying again…"
        : saveState === "saved"
          ? "Saved"
          : "";

  // ---- pieces ------------------------------------------------------------

  const indexList = pages && (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 pb-2">
        <h3 className={`${notebookHand.className} text-[26px] font-bold leading-none text-[#0f766e]`}>All pages</h3>
        {(previous || showIndex) && (
          <button
            type="button"
            onClick={() => setShowIndex(false)}
            className="min-h-11 rounded-full px-3 text-sm font-semibold text-[#1f2a44] hover:bg-[#f1ead7]"
          >
            Back to the page
          </button>
        )}
      </div>
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1" data-testid="notebook-index">
        {[...pages].reverse().map((p) => {
          const n = pages.indexOf(p) + 1;
          const active = p.id === currentId;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => void goTo(p.id)}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-12 w-full items-baseline gap-3 rounded-xl px-3 py-2 text-left transition ${
                  active ? "bg-[#e3f4ef]" : "hover:bg-[#f1ead7]"
                }`}
              >
                <span className="shrink-0 text-sm font-bold text-[#0f766e]">Page {n}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-[#1f2a44]">
                  {p.preview || <span className="italic text-[#6b6452]">Nothing written yet</span>}
                </span>
                <span className="shrink-0 text-[13px] font-medium text-[#6b6452]">
                  {formatClinicDateShort(p.created_at)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  const pageHead = page && (
    <div className="flex items-baseline justify-between gap-3">
      <span className={`${notebookHand.className} text-[26px] font-bold leading-[30px] text-[#0f766e]`}>
        {formatClinicDateLong(page.created_at)}
      </span>
      <span className="shrink-0 text-[13px] font-semibold text-[#6b6452]" data-testid="notebook-page-number">
        Page {index + 1} of {pages?.length ?? 1}
      </span>
    </div>
  );

  const writing = (
    <motion.div
      key={currentId ?? "none"}
      initial={stage === "open" && !prefersReducedMotion() ? { opacity: 0, x: turn * 28 } : false}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="flex min-h-0 flex-1 flex-col"
    >
      {pageHead}
      {currentBody?.status === "error" ? (
        <div className="mt-1 min-h-0 flex-1 overflow-y-auto pt-[30px] leading-[30px]" style={RULED}>
          <p>This page couldn&apos;t be opened just now.</p>
          <button
            type="button"
            onClick={() => currentId && void loadBody(currentId)}
            className="mt-[30px] min-h-11 rounded-full bg-[#0f766e] px-4 text-sm font-bold text-white"
          >
            Try again
          </button>
        </div>
      ) : initialDoc && currentId ? (
        // The toolbar stays put; only the ruled page under it scrolls, so
        // every line of writing sits on a rule.
        <div className="mt-1.5 flex min-h-0 flex-1 flex-col">
          <RichTextEditor
            key={currentId}
            initialDoc={initialDoc}
            onChange={(json) => onEdit(currentId, json)}
            label={`Notebook page ${index + 1}`}
            placeholder="Write anything here. Only you can read it."
            testId="notebook-editor"
            tables
            chromeless
            contentClassName={WRITING}
            contentWrapperClassName="mt-1 min-h-0 flex-1 overflow-y-auto"
            contentWrapperStyle={RULED}
          />
        </div>
      ) : (
        <div className="mt-1 min-h-0 flex-1 overflow-y-auto" style={RULED}>
          <p className="leading-[30px] text-[#6b6452]">Opening your page&hellip;</p>
        </div>
      )}
    </motion.div>
  );

  const roundButton =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#d6cfbd] bg-white text-[#1f2a44] disabled:opacity-40";
  const controls = (
    <div className="shrink-0 pt-1">
      <p
        role="status"
        className="h-5 text-right text-[13px] font-medium text-[#6b6452]"
        data-testid="notebook-save-state"
      >
        {saveLabel}
      </p>
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => previous && void goTo(previous.id)}
            disabled={!previous || busy}
            aria-label="Older page"
            className={roundButton}
          >
            <i aria-hidden="true" className="fa-solid fa-chevron-left text-sm"></i>
          </button>
          <button
            type="button"
            onClick={() => pages && index < pages.length - 1 && void goTo(pages[index + 1].id)}
            disabled={!pages || index >= pages.length - 1 || busy}
            aria-label="Newer page"
            className={roundButton}
          >
            <i aria-hidden="true" className="fa-solid fa-chevron-right text-sm"></i>
          </button>
          <button
            type="button"
            onClick={() => setShowIndex((v) => !v)}
            aria-pressed={showIndex}
            aria-label="All pages"
            className="flex h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-full border border-[#d6cfbd] bg-white px-3.5 text-sm font-bold text-[#1f2a44]"
          >
            <i aria-hidden="true" className="fa-solid fa-list text-xs"></i>
            <span className="hidden sm:inline">All pages</span>
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void deletePage()}
            disabled={!page || busy}
            aria-label="Delete this page"
            title="Delete this page"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#9f1239] hover:bg-[#fde8e8] disabled:opacity-40"
          >
            <i aria-hidden="true" className="fa-solid fa-trash text-sm"></i>
          </button>
          <button
            type="button"
            onClick={() => void newPage()}
            disabled={!pages || busy}
            className="flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-[#0f766e] px-4 text-sm font-bold text-white disabled:opacity-60"
          >
            <i aria-hidden="true" className="fa-solid fa-plus text-xs"></i>
            New page
          </button>
        </div>
      </div>
    </div>
  );

  const failed = (
    <div className="flex flex-1 flex-col items-start justify-center gap-4 leading-[30px]">
      <p className="text-[16px]">Your notebook couldn&apos;t be opened just now.</p>
      <button
        type="button"
        onClick={() => void load()}
        className="min-h-11 rounded-full bg-[#0f766e] px-5 text-sm font-bold text-white"
      >
        Try again
      </button>
    </div>
  );

  const leftPage = (
    <div className="flex h-full min-h-0 flex-col">
      {showIndex || !previous ? (
        pages ? (
          indexList
        ) : null
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <span className={`${notebookHand.className} text-[26px] font-bold leading-[30px] text-[#0f766e]`}>
              {formatClinicDateLong(previous.created_at)}
            </span>
            <span className="shrink-0 text-[13px] font-semibold text-[#6b6452]">Page {index}</span>
          </div>
          <div className="mt-1 min-h-0 flex-1 overflow-y-auto" style={RULED}>
            {previousBody?.status === "ready" ? (
              previousBody.value ? (
                <RichTextView value={previousBody.value} options={{ tables: true }} className={READING} />
              ) : (
                <p className="leading-[30px] italic text-[#6b6452]">Nothing written on this page.</p>
              )
            ) : (
              <p className="leading-[30px] text-[#6b6452]">
                {previousBody?.status === "error" ? "This page couldn’t be opened just now." : "Opening…"}
              </p>
            )}
          </div>
          <div className="shrink-0 pt-2">
            <button
              type="button"
              onClick={() => void goTo(previous.id)}
              disabled={busy}
              className="min-h-11 rounded-full border border-[#d6cfbd] bg-white px-4 text-sm font-bold text-[#1f2a44]"
            >
              Write on this page
            </button>
          </div>
        </>
      )}
    </div>
  );

  const turning = stage !== "open";

  return (
    <OverlayPortal>
      <div
        className={`${notebookHand.variable} fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-md`}
        data-testid="notebook-backdrop"
      >
        <div
          ref={panelRef}
          {...dialogProps}
          tabIndex={-1}
          data-testid="notebook"
          data-stage={stage}
          className="relative flex h-[100dvh] w-full flex-col outline-none lg:h-[min(44rem,92dvh)] lg:w-[min(68rem,96vw)]"
          style={{ color: INK }}
        >
          {/* top row: what this is, and the way out */}
          <div className="flex h-14 shrink-0 items-center justify-between gap-2 bg-[#0f766e] px-2 lg:h-12 lg:bg-transparent lg:px-0 lg:pb-2">
            <button
              type="button"
              onClick={() => void close()}
              aria-label="Close notebook"
              data-testid="notebook-close"
              className="flex h-11 w-11 items-center justify-center rounded-full text-white hover:bg-white/15 lg:order-3 lg:h-11 lg:w-auto lg:gap-2 lg:bg-white lg:px-4 lg:text-sm lg:font-bold lg:text-[#1f2a44] lg:hover:bg-slate-100"
            >
              <i aria-hidden="true" className="fa-solid fa-xmark text-base lg:text-sm"></i>
              <span className="hidden lg:inline">Close</span>
            </button>
            <h2
              id={titleId}
              className={`${notebookHand.className} truncate text-[26px] font-bold leading-none text-white`}
            >
              {title}
            </h2>
            <span className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-[#115e59] px-3 text-[13px] font-semibold text-white lg:order-first">
              <i aria-hidden="true" className="fa-solid fa-lock text-[11px]"></i>
              <span className="lg:hidden">Only you</span>
              <span className="hidden lg:inline">Only you can read this</span>
            </span>
          </div>

          {/* One book, two shapes. On a phone it is a single page under a
              row of rings; from `lg` the same page is the right-hand side
              of an open spread. One set of elements, shaped by CSS -- the
              editor exists once, so nothing typed can be lost to a resize. */}
          <div
            className="relative min-h-0 flex-1 bg-[#0f766e] px-2 pb-2 [perspective:1600px] lg:bg-transparent lg:p-0 lg:[perspective:2400px]"
          >
            <div
              className={`relative h-full lg:transition-transform lg:duration-[900ms] lg:ease-[cubic-bezier(0.3,0.1,0.2,1)] ${
                stage === "cover" ? "lg:-translate-x-1/4" : "lg:translate-x-0"
              }`}
            >
              {/* left page (laptop only): the page before, or the list */}
              <div
                className={`absolute inset-y-0 left-0 hidden w-1/2 rounded-[16px_4px_4px_16px] bg-[#0f766e] p-1.5 pr-0 shadow-2xl transition-opacity duration-300 lg:block ${
                  turning ? "opacity-0" : "opacity-100"
                }`}
              >
                <div
                  className="relative h-full overflow-hidden rounded-[11px_2px_2px_11px] py-6 pl-8 pr-9"
                  style={{ backgroundColor: PAPER }}
                >
                  <span aria-hidden="true" className="absolute inset-y-0 right-0 w-3.5 bg-[#efe8d4]"></span>
                  {loadFailed ? null : leftPage}
                </div>
              </div>

              {/* the page being written */}
              <div className="relative h-full lg:absolute lg:inset-y-0 lg:right-0 lg:h-auto lg:w-1/2 lg:rounded-[4px_16px_16px_4px] lg:bg-[#0f766e] lg:p-1.5 lg:pl-0 lg:shadow-2xl">
                <div
                  className="relative flex h-full flex-col overflow-hidden rounded-[6px_6px_18px_18px] px-4 pb-3 pt-9 lg:rounded-[2px_11px_11px_2px] lg:py-6 lg:pl-9 lg:pr-8"
                  style={{ backgroundColor: PAPER }}
                >
                  <div aria-hidden="true" className="absolute inset-x-0 top-3 flex justify-around px-4 lg:hidden">
                    {Array.from({ length: 9 }, (_, i) => (
                      <span key={i} className="h-3 w-3 rounded-full bg-[#0b5e57]"></span>
                    ))}
                  </div>
                  <span aria-hidden="true" className="absolute inset-y-0 left-0 hidden w-3.5 bg-[#efe8d4] lg:block"></span>
                  {loadFailed ? (
                    failed
                  ) : (
                    <>
                      {/* On a phone the list of pages takes the page's place;
                          on a laptop it is on the left, and this stays. */}
                      {showIndex && <div className="flex min-h-0 flex-1 flex-col lg:hidden">{indexList}</div>}
                      <div className={`min-h-0 flex-1 flex-col ${showIndex ? "hidden lg:flex" : "flex"}`}>
                        {writing}
                        {controls}
                      </div>
                    </>
                  )}
                </div>
                <span aria-hidden="true" className="absolute -bottom-6 left-[62%] hidden h-8 w-3.5 bg-[#d97706] lg:block"></span>
              </div>

              {/* The cover. Scenery only, removed once it has turned: on a
                  phone it lifts on the rings, on a laptop it swings on the
                  spine and its back is the blank left-hand page. */}
              {turning && (
                <>
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-[6px_6px_18px_18px] transition-transform duration-[900ms] ease-[cubic-bezier(0.3,0.1,0.2,1)] lg:hidden"
                    style={{
                      transformOrigin: "top center",
                      transform: stage === "turning" ? "rotateX(-100deg)" : "rotateX(0deg)",
                    }}
                  >
                    <Cover title={title} vertical />
                  </span>
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-1/2 hidden w-1/2 transition-transform duration-[950ms] ease-[cubic-bezier(0.3,0.1,0.2,1)] lg:block"
                    style={{
                      transformOrigin: "left center",
                      transformStyle: "preserve-3d",
                      transform: stage === "turning" ? "rotateY(-180deg)" : "rotateY(0deg)",
                    }}
                  >
                    <span
                      className="absolute inset-0 rounded-[4px_16px_16px_4px]"
                      style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
                    >
                      <Cover title={title} vertical={false} />
                    </span>
                    <span
                      className="absolute inset-0 rounded-[4px_16px_16px_4px] bg-[#0f766e] p-1.5 pl-0"
                      style={{
                        backfaceVisibility: "hidden",
                        WebkitBackfaceVisibility: "hidden",
                        transform: "rotateY(180deg)",
                      }}
                    >
                      <span className="block h-full rounded-[2px_11px_11px_2px]" style={{ backgroundColor: PAPER }}></span>
                    </span>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      {confirmDialog}
    </OverlayPortal>
  );
}

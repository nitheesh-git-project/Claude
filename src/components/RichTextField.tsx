"use client";

import { useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "@/lib/useRouter";
import { useUnloadWarning } from "@/lib/useUnloadWarning";
import { useConfirm } from "@/lib/useConfirm";
import { parseRichText, sanitizeRichDoc, serializeRichText } from "@/lib/richText";
import RichTextEditor from "@/components/RichTextEditor";
import RichTextView from "@/components/RichTextView";

/**
 * Formatted public copy with a read view and an edit view.
 *
 * Saved, it shows exactly what was stored -- the same renderer the public
 * page uses, in grey -- with an Edit button. Edit opens the Docs-style editor
 * with Cancel and Save. Leaving with unsaved changes asks first: the page's
 * own unload prompt while the editor holds changes, and the app's dialog on
 * Cancel.
 */
export default function RichTextField({
  label,
  storedValue,
  endpoint,
  body,
  emptyText,
  placeholder,
  viewHref,
  viewLabel = "View on /team",
  testId,
}: {
  /** The editor's accessible name, e.g. "Public display content". */
  label: string;
  /** The column as stored: a document, older plain text, or null. */
  storedValue: string | null;
  /** POSTed `{ ...body, content }` with the editor's JSON. */
  endpoint: string;
  body: Record<string, unknown>;
  emptyText: string;
  placeholder?: string;
  viewHref?: string;
  viewLabel?: string;
  testId?: string;
}) {
  const savedSerialized = useMemo(
    () => serializeRichText(parseRichText(storedValue)),
    [storedValue]
  );
  // Prop-derived base: reverts on failure, matches the new prop once
  // router.refresh() lands.
  const [optimisticSaved, setOptimisticSaved] = useOptimistic(savedSerialized);
  const [editing, setEditing] = useState(false);
  const draftRef = useRef<unknown>(null);
  const [dirty, setDirty] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  useUnloadWarning((editing && dirty) || isPending);

  function startEditing() {
    draftRef.current = null;
    setDirty(false);
    setError(null);
    setEditing(true);
  }

  async function cancel() {
    if (
      dirty &&
      !(await confirm("Discard your changes? What you typed since the last save will be lost.", {
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
      }))
    ) {
      return;
    }
    setEditing(false);
    setDirty(false);
    setError(null);
  }

  function save() {
    const next = serializeRichText(sanitizeRichDoc(draftRef.current));
    if (!dirty || next === optimisticSaved) {
      setEditing(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      setOptimisticSaved(next);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, content: draftRef.current }),
      }).catch(() => null);
      if (res?.ok) {
        setEditing(false);
        setDirty(false);
        router.refresh();
      } else {
        const data = res ? await res.json().catch(() => ({})) : {};
        setError(data.error ?? "Could not save. Please try again.");
      }
    });
  }

  return (
    <div className="space-y-2 text-xs" data-testid={testId}>
      {editing ? (
        <>
          <RichTextEditor
            initialDoc={parseRichText(optimisticSaved)}
            label={label}
            placeholder={placeholder}
            testId={testId ? `${testId}-editor` : undefined}
            onChange={(json) => {
              draftRef.current = json;
              setDirty(serializeRichText(sanitizeRichDoc(json)) !== optimisticSaved);
            }}
          />
          {error && (
            <p role="alert" className="text-red-600">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={cancel}
              disabled={isPending}
              className="rounded-xl bg-slate-200 px-4 py-2 font-semibold text-slate-800 transition hover:bg-slate-300 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={isPending}
              className="rounded-xl bg-teal-700 px-4 py-2 font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
            >
              {isPending ? "Saving…" : "Save"}
            </button>
            {dirty && !isPending && <span className="text-slate-500">Unsaved changes</span>}
          </div>
        </>
      ) : (
        <>
          {optimisticSaved ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed text-slate-500">
              <RichTextView value={optimisticSaved} testId={testId ? `${testId}-saved` : undefined} />
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-slate-500">
              {emptyText}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={startEditing}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-200 px-4 py-2 font-semibold text-slate-800 transition hover:bg-slate-300"
            >
              <i className="fa-solid fa-pen text-[10px]" aria-hidden="true" />
              {optimisticSaved ? "Edit" : "Add"}
            </button>
            {viewHref && (
              <Link
                href={viewHref}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1 font-semibold text-teal-700 hover:underline"
              >
                {viewLabel}
                <i className="fa-solid fa-arrow-up-right-from-square text-[9px]" aria-hidden="true" />
              </Link>
            )}
          </div>
        </>
      )}
      {dialog}
    </div>
  );
}

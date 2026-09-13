"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import { useConfirm } from "@/lib/useConfirm";
import { isOrderChanged, moveIdOnePlace } from "@/lib/listOrdering";
import {
  MAX_PRINCIPLE_BODY_LENGTH,
  MAX_PRINCIPLE_TITLE_LENGTH,
  MISSION_ICONS,
  missionIcon,
  type MissionPrincipleKind,
} from "@/lib/mission";

export type MissionPrincipleRecord = {
  id: string;
  kind: string;
  title: string;
  body: string;
  icon: string | null;
  display_order: number;
  active: boolean;
};

/**
 * Settings → Public Site: the four promises and the three limits.
 *
 * One component for both bands, given the kind -- they are the same shape and
 * the same editing job, and two copies would be two places for the ordering
 * rule below to drift. The band's own words come in as props so the screen can
 * say "promise" or "limit" rather than "item".
 *
 * Ordering follows the Conditions screen exactly, for the reason written on
 * that route: the arrows rearrange in the browser only, **Save order** posts
 * the whole band, and the button is always rendered and only enabled once
 * something moved -- so saving is visibly the step that publishes. A pairwise
 * swap is what this replaces; two rows sharing a display_order swapped to the
 * same two numbers and the public page never changed.
 *
 * Deleting the last row of a band is allowed, and the note under the list says
 * what happens: the pages fall back to the wording the site shipped with. A
 * delete whose visible effect is the original text reappearing reads as a
 * failed delete unless the screen says so first.
 */
export default function MissionPrincipleManager({
  kind,
  rows,
  heading,
  blurb,
  noun,
}: {
  kind: MissionPrincipleKind;
  rows: MissionPrincipleRecord[];
  heading: string;
  blurb: string;
  /** What one row is called, in the owner's words: "promise" / "limit". */
  noun: string;
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const mine = rows.filter((row) => row.kind === kind);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const submitting = useRef(false);

  // The arrows rearrange this list and nothing else; the order reaches the
  // database when Save order is tapped. Saving one move per tap would make
  // every arrangement an admin passes through on the way to the one they want
  // a write the public pages then publish.
  const serverIds = mine.map((row) => row.id);
  const [orderedIds, setOrderedIds] = useState<string[]>(() => serverIds);

  // Adjust-state-while-rendering rather than an effect, the same pattern the
  // Conditions screen uses, and resyncing only when the SET of rows changes:
  // this screen is on the catalog realtime channel, and resyncing on any prop
  // change would let a refresh throw away an arrangement nobody had saved yet.
  const [prevIdSetKey, setPrevIdSetKey] = useState(() => [...serverIds].sort().join(","));
  const idSetKey = [...serverIds].sort().join(",");
  if (idSetKey !== prevIdSetKey) {
    setPrevIdSetKey(idSetKey);
    setOrderedIds(serverIds);
    setError(null);
  }

  const byId = new Map(mine.map((row) => [row.id, row]));
  // Falls back to the server order for any id the map has lost, so a render
  // between those two states can never drop a row off the screen.
  const arranged = orderedIds
    .map((id) => byId.get(id))
    .filter((row): row is MissionPrincipleRecord => Boolean(row));
  const order = arranged.length === mine.length ? arranged : mine;
  const visibleIds = order.map((row) => row.id);
  const moved = isOrderChanged(visibleIds, serverIds);

  function move(id: string, direction: "up" | "down") {
    setError(null);
    setOrderedIds(moveIdOnePlace(visibleIds, id, direction));
  }

  function post(url: string, payload: Record<string, unknown>) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not save. Please try again.");
    });
  }

  function saveOrder() {
    if (submitting.current) return;
    setError(null);
    submitting.current = true;
    startTransition(async () => {
      try {
        await post("/api/admin/reorder-mission-principles", { kind, ids: visibleIds });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save. Please try again.");
        return;
      } finally {
        submitting.current = false;
      }
      router.refresh();
    });
  }

  async function remove(row: MissionPrincipleRecord) {
    if (
      !(await confirm(
        `Delete "${row.title}"? ${
          order.length === 1
            ? `It is the last ${noun}, so both pages will go back to the wording the site shipped with.`
            : "This can't be undone."
        }`
      ))
    ) {
      return;
    }
    if (submitting.current) return;
    setError(null);
    submitting.current = true;
    startTransition(async () => {
      try {
        await post("/api/admin/delete-mission-principle", { id: row.id });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not delete. Please try again.");
        return;
      } finally {
        submitting.current = false;
      }
      router.refresh();
    });
  }

  function toggleActive(row: MissionPrincipleRecord) {
    if (submitting.current) return;
    setError(null);
    submitting.current = true;
    startTransition(async () => {
      try {
        await post("/api/admin/save-mission-principle", {
          id: row.id,
          kind: row.kind,
          title: row.title,
          body: row.body,
          icon: row.icon,
          active: !row.active,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save. Please try again.");
        return;
      } finally {
        submitting.current = false;
      }
      router.refresh();
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <h2 className="font-display font-bold text-lg text-slate-800 mb-1">{heading}</h2>
      <p className="text-xs text-slate-500 mb-4">{blurb}</p>

      {order.length === 0 ? (
        <p className="text-xs text-slate-500 py-4 text-center">
          None of your own yet, so both pages show the {noun}s the site shipped with. Add one below
          and yours replace them.
        </p>
      ) : (
        <ul className="space-y-3">
          {order.map((row, index) =>
            editingId === row.id ? (
              <li key={row.id}>
                <MissionPrincipleForm
                  kind={kind}
                  row={row}
                  noun={noun}
                  onDone={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li key={row.id} className="p-4 rounded-xl border border-slate-200 text-xs space-y-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-start gap-3">
                    <i
                      className={`fa-solid ${missionIcon(row.icon)} text-teal-700 mt-0.5`}
                      aria-hidden="true"
                    />
                    <div>
                      <p className="font-bold text-slate-900">{row.title}</p>
                      <p className="text-slate-600 leading-relaxed mt-1">{row.body}</p>
                    </div>
                  </div>
                  <span
                    className={`font-semibold px-2.5 py-1 rounded-full ${
                      row.active ? "text-teal-700 bg-teal-50" : "text-slate-500 bg-slate-100"
                    }`}
                  >
                    {row.active ? "On the site" : "Hidden"}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-3 flex-wrap">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => move(row.id, "up")}
                      disabled={index === 0 || isPending}
                      aria-label={`Move ${row.title} up`}
                      className="px-2 py-1 rounded border border-slate-200 text-slate-600 disabled:opacity-40"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(row.id, "down")}
                      disabled={index === order.length - 1 || isPending}
                      aria-label={`Move ${row.title} down`}
                      className="px-2 py-1 rounded border border-slate-200 text-slate-600 disabled:opacity-40"
                    >
                      ↓
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggleActive(row)}
                      disabled={isPending}
                      className="text-[11px] text-slate-600 font-semibold hover:underline disabled:opacity-60"
                    >
                      {row.active ? "Hide" : "Show"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(row.id)}
                      className="text-[11px] text-teal-700 font-semibold hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(row)}
                      disabled={isPending}
                      className="text-[11px] text-red-600 font-semibold hover:underline disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            )
          )}
        </ul>
      )}

      {order.length > 1 && (
        <div className="flex items-center gap-3 mt-4">
          <button
            type="button"
            onClick={saveOrder}
            disabled={!moved || isPending}
            className="bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-lg transition"
          >
            {isPending ? "Saving..." : "Save order"}
          </button>
          <span className="text-[11px] text-slate-400">
            {moved
              ? "The arrows have rearranged the list here only — save to publish it."
              : "Use the arrows, then save."}
          </span>
        </div>
      )}

      <div className="mt-5">
        {addingNew ? (
          <MissionPrincipleForm
            kind={kind}
            noun={noun}
            onDone={() => setAddingNew(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAddingNew(true)}
            className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold px-4 py-2 rounded-xl transition"
          >
            + Add {noun}
          </button>
        )}
      </div>

      {error && <p className="text-[11px] text-red-600 mt-2">{error}</p>}
      {dialog}
    </div>
  );
}

/**
 * The one form, for a new row and for an edit.
 *
 * The icon is a picker over MISSION_ICONS rather than a text box: a class this
 * app does not load draws an empty square on the mission page, and an admin
 * cannot tell that from a row that failed to save.
 */
function MissionPrincipleForm({
  kind,
  row,
  noun,
  onDone,
}: {
  kind: MissionPrincipleKind;
  row?: MissionPrincipleRecord;
  noun: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(row?.title ?? "");
  const [body, setBody] = useState(row?.body ?? "");
  const [icon, setIcon] = useState(row?.icon ?? MISSION_ICONS[0]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const submitting = useRef(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting.current) return;
    setError(null);
    submitting.current = true;
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/save-mission-principle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(row ? { id: row.id } : {}),
            kind,
            title,
            body,
            icon,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Could not save. Please try again.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save. Please try again.");
        return;
      } finally {
        submitting.current = false;
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 text-xs"
    >
      {error && <p className="text-red-600">{error}</p>}
      <div>
        <label className="block font-semibold mb-1" htmlFor={`principle-title-${kind}-${row?.id ?? "new"}`}>
          Title
        </label>
        <input
          id={`principle-title-${kind}-${row?.id ?? "new"}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={MAX_PRINCIPLE_TITLE_LENGTH}
          className="w-full p-2 rounded-lg border border-slate-300"
        />
        <p className="text-[11px] text-slate-400 mt-1">A few words. This is the headline.</p>
      </div>
      <div>
        <label className="block font-semibold mb-1" htmlFor={`principle-body-${kind}-${row?.id ?? "new"}`}>
          The line under it
        </label>
        <textarea
          id={`principle-body-${kind}-${row?.id ?? "new"}`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          rows={2}
          maxLength={MAX_PRINCIPLE_BODY_LENGTH}
          className="w-full p-2 rounded-lg border border-slate-300"
        />
        <p className="text-[11px] text-slate-400 mt-1">
          One line, and something a patient could check. Keep it to what actually happens.
        </p>
      </div>
      <div>
        <span className="block font-semibold mb-1">Icon</span>
        <div className="flex flex-wrap gap-2">
          {MISSION_ICONS.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setIcon(name)}
              aria-label={name.replace("fa-", "").replace(/-/g, " ")}
              aria-pressed={icon === name}
              className={`h-9 w-9 rounded-lg border flex items-center justify-center ${
                icon === name
                  ? "border-teal-700 bg-teal-50 text-teal-700"
                  : "border-slate-300 text-slate-500"
              }`}
            >
              <i className={`fa-solid ${name}`} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-semibold px-4 py-2 rounded-lg transition"
        >
          {isPending ? "Saving..." : row ? "Save changes" : `Add ${noun}`}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-slate-500 font-semibold hover:underline"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

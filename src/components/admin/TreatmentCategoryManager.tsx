"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import TreatmentCategoryForm from "./TreatmentCategoryForm";
import { countFeatured, FEATURED_LIMIT } from "@/lib/catalogFeatured";
import { useConfirm } from "@/lib/useConfirm";
import { isOrderChanged, moveIdOnePlace } from "@/lib/listOrdering";
import Modal from "@/components/admin/Modal";

type Category = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  featured?: boolean | null;
  points: string[];
  price_paise: number;
  duration_minutes: number;
  cta_label: string;
  display_order: number;
  active: boolean;
  /** Migration-dependent, read in its own call by the caller. */
  specialty?: string | null;
  /** The condition's programme code (PED). Undefined when the database has
   *  no such column yet, which hides the field. */
  short_code?: string | null;
};

function DeleteButton({ id, title }: { id: string; title: string }) {
  // The parent only renders this row while the category still exists, so a
  // real success unmounts it via router.refresh() before this optimistic
  // overlay would need to clear on its own -- a failure just reverts to the
  // base `false`. See PatientActiveToggle's comment.
  const [optimisticDeleted, setOptimisticDeleted] = useOptimistic(false);
  const [isPending, startTransition] = useTransition();
  // A refusal here is a paragraph naming which rows are in the way and what
  // to do instead, so it goes in a dialog. It used to be an 11px line
  // clipped to 160px beside the button -- unreadable, and easy to miss
  // entirely, which is how "delete does nothing" gets reported for a delete
  // that was refused and said so.
  const [refusal, setRefusal] = useState<string | null>(null);
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  async function handleDelete() {
    if (!(await confirm(`Delete "${title}"? This can't be undone.`))) return;
    setRefusal(null);
    startTransition(async () => {
      setOptimisticDeleted(true);
      try {
        const res = await fetch("/api/admin/delete-treatment-category", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        if (res.ok) {
          router.refresh();
          return;
        }
        const data = await res.json().catch(() => ({}));
        setRefusal(data.error ?? "Could not delete. Please try again.");
      } catch {
        // Without this the request dying on a bad connection threw inside
        // the transition and nothing reached the screen at all -- the same
        // silence this whole change is about.
        setRefusal("Could not reach the server. Nothing has changed.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {optimisticDeleted && !refusal ? (
        <span className="text-[11px] font-semibold text-slate-500">Deleting...</span>
      ) : (
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="text-[11px] text-red-600 font-semibold hover:underline disabled:opacity-60"
        >
          Delete
        </button>
      )}
      {refusal && (
        <Modal
          title={`"${title}" cannot be deleted`}
          onClose={() => setRefusal(null)}
        >
          <div className="space-y-4">
            <p className="text-xs leading-relaxed text-slate-700">{refusal}</p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setRefusal(null)}
                className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-900"
              >
                Got it
              </button>
            </div>
          </div>
        </Modal>
      )}
      {dialog}
    </div>
  );
}

function MoveButtons({
  isFirst,
  isLast,
  isPending,
  onMove,
}: {
  isFirst: boolean;
  isLast: boolean;
  isPending: boolean;
  onMove: (direction: "up" | "down") => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onMove("up")}
        disabled={isFirst || isPending}
        title="Move up"
        className="w-6 h-6 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <i className="fa-solid fa-chevron-up text-[10px]"></i>
      </button>
      <button
        onClick={() => onMove("down")}
        disabled={isLast || isPending}
        title="Move down"
        className="w-6 h-6 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <i className="fa-solid fa-chevron-down text-[10px]"></i>
      </button>
    </div>
  );
}

/**
 * "Default on booking": the one service /book and /book-home-visit open on.
 * Turning it on for this row turns it off for whichever had it -- the
 * database allows one (set_default_treatment_category, schema.sql), so the
 * list redraws from the server rather than trusting this click.
 */
function DefaultSwitch({
  id,
  title,
  isDefault,
  active,
  onError,
}: {
  id: string;
  title: string;
  isDefault: boolean;
  active: boolean;
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(isDefault);
  const disabled = isPending || (!active && !isDefault);

  function toggle() {
    if (disabled) return;
    const next = !optimistic;
    onError(null);
    startTransition(async () => {
      setOptimistic(next);
      const res = await fetch("/api/admin/set-default-treatment-category", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: next ? id : null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        onError(data.error ?? "Could not change the booking default. Please try again.");
      }
      router.refresh();
    });
  }

  return (
    <label
      className="flex items-center gap-2"
      title={
        !active && !isDefault
          ? "Only an active service can be the booking default."
          : "The service the booking pages open on. Only one at a time."
      }
    >
      <button
        type="button"
        role="switch"
        aria-checked={optimistic}
        aria-label={`Default on booking: ${title}`}
        onClick={toggle}
        disabled={disabled}
        data-testid="default-on-booking"
        className={`relative h-6 w-10 shrink-0 rounded-full transition disabled:opacity-50 ${
          optimistic ? "bg-teal-700" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            optimistic ? "left-[18px]" : "left-0.5"
          }`}
        />
      </button>
      <span className={`font-semibold ${optimistic ? "text-teal-800" : "text-slate-600"}`}>
        Default on booking
      </span>
    </label>
  );
}

export default function TreatmentCategoryManager({
  categories,
  defaultServiceId,
}: {
  categories: Category[];
  /** The service booking opens on: its id, null for none, undefined when
   *  the database has no such setting yet (the switch is then not drawn). */
  defaultServiceId?: string | null;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [duplicateFrom, setDuplicateFrom] = useState<Category | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [defaultError, setDefaultError] = useState<string | null>(null);
  const router = useRouter();

  // The arrows rearrange this list and nothing else; the order reaches the
  // database only when Save order is tapped. It used to save one move per
  // tap, which made every intermediate arrangement -- the ones an admin
  // passes through on the way to the one they want -- a write that the
  // public pages would have had to publish.
  const [orderedIds, setOrderedIds] = useState<string[]>(() =>
    categories.map((c) => c.id)
  );
  const [isSavePending, startSaveTransition] = useTransition();

  const serverIds = categories.map((c) => c.id);

  // Adjust-state-while-rendering rather than an effect, same pattern as
  // Navbar's navigating reset. Resync only when the SET of rows changes (a
  // category added, deleted or deactivated elsewhere) -- resyncing on any
  // prop change would let the catalog realtime channel's refresh silently
  // throw away an arrangement the admin has not saved yet.
  const [prevIdSetKey, setPrevIdSetKey] = useState(() =>
    [...serverIds].sort().join(",")
  );
  const idSetKey = [...serverIds].sort().join(",");
  if (idSetKey !== prevIdSetKey) {
    setPrevIdSetKey(idSetKey);
    setOrderedIds(serverIds);
    setMoveError(null);
    setSavedNotice(false);
  }

  const byId = new Map(categories.map((c) => [c.id, c]));
  // Falls back to the server order for any id the map has lost, so a render
  // between the two states above can never drop a row off the screen.
  const orderedCategories = orderedIds
    .map((id) => byId.get(id))
    .filter((c): c is Category => Boolean(c));
  const visibleCategories =
    orderedCategories.length === categories.length ? orderedCategories : categories;

  const visibleIds = visibleCategories.map((c) => c.id);
  const isDirty = isOrderChanged(visibleIds, serverIds);

  function handleMove(id: string, direction: "up" | "down") {
    setOrderedIds(moveIdOnePlace(visibleIds, id, direction));
    setMoveError(null);
    setSavedNotice(false);
  }

  function discardOrder() {
    setOrderedIds(serverIds);
    setMoveError(null);
    setSavedNotice(false);
  }

  function saveOrder() {
    if (!isDirty || isSavePending) return;
    setMoveError(null);
    setSavedNotice(false);
    startSaveTransition(async () => {
      const res = await fetch("/api/admin/reorder-treatment-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: visibleIds }),
      });
      if (res.ok) {
        setSavedNotice(true);
        // The server order now matches what is on screen, so the resync
        // above is a no-op and the list does not jump.
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setMoveError(data.error ?? "Could not save the order. Please try again.");
      }
    });
  }

  function startAddNew() {
    setDuplicateFrom(null);
    setAddingNew(true);
  }

  // Always append at the very end (max existing order + 1) rather than
  // source.display_order + 1 - the latter can collide with whatever category
  // already occupies that number.
  const nextDisplayOrder =
    categories.reduce((max, c) => Math.max(max, c.display_order), 0) + 1;

  function startDuplicate(cat: Category) {
    setDuplicateFrom({ ...cat, display_order: nextDisplayOrder });
    setAddingNew(true);
  }

  function closeAddNew() {
    setAddingNew(false);
    setDuplicateFrom(null);
  }

  // Says where the four come from, at the screen that sets them. Without
  // it, an admin who ticks six sees four on the live site and has no way to
  // tell whether the other two failed to save.
  const featuredCount = countFeatured(categories);
  // Every other condition's programme code, so the form can say a code is
  // taken before the save does -- and suggest a free one.
  const codesKnown = categories.some((c) => c.short_code !== undefined);
  const takenCodes = (selfId: string | null): string[] | undefined =>
    codesKnown
      ? categories.filter((c) => c.id !== selfId && c.short_code).map((c) => c.short_code as string)
      : undefined;

  return (
    <div className="space-y-3">
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
        The home page leads with{" "}
        <strong className="font-semibold">{FEATURED_LIMIT} conditions</strong> and links
        to the full list on /conditions.{" "}
        {featuredCount === 0
          ? "None are ticked, so it shows the first four in this order."
          : featuredCount <= FEATURED_LIMIT
            ? `${featuredCount} ticked.`
            : `${featuredCount} ticked - the first ${FEATURED_LIMIT} in this order are the ones shown.`}
      </p>
      {moveError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
          {moveError}
        </p>
      )}
      {defaultServiceId !== undefined && (
        <p className="text-xs text-slate-500">
          {defaultServiceId
            ? "Default on booking: the service the booking pages open on when a link does not name one. Only one at a time."
            : "No service is the booking default, so the booking pages open with nothing picked. Switch one on below."}
        </p>
      )}
      {defaultError && (
        <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
          {defaultError}
        </p>
      )}
      {visibleCategories.length === 0 && !addingNew ? (
        <p className="text-xs text-slate-500 py-4 text-center">
          No condition categories yet - add one below.
        </p>
      ) : (
        <ul className="space-y-3">
          {visibleCategories.map((cat, i) =>
            editingId === cat.id ? (
              <li key={cat.id}>
                <TreatmentCategoryForm
                  category={cat}
                  takenCodes={takenCodes(cat.id)}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li
                key={cat.id}
                className="p-4 rounded-xl border border-slate-200 text-xs space-y-2"
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <MoveButtons
                      isFirst={i === 0}
                      isLast={i === visibleCategories.length - 1}
                      isPending={isSavePending}
                      onMove={(direction) => handleMove(cat.id, direction)}
                    />
                    <div>
                      <p className="font-bold text-slate-900">
                        {cat.title}
                        {cat.short_code && (
                          <span
                            title="This condition's programme code. Its programmes are numbered under it, e.g. a first video programme is this code + _PKG001."
                            className="ml-2 rounded-md bg-indigo-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-indigo-800 ring-1 ring-indigo-200"
                          >
                            {cat.short_code}
                          </span>
                        )}
                      </p>
                      {cat.description && (
                        <p className="text-slate-500 mt-0.5">{cat.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {defaultServiceId !== undefined && (
                      <DefaultSwitch
                        id={cat.id}
                        title={cat.title}
                        isDefault={defaultServiceId === cat.id}
                        active={cat.active}
                        onError={setDefaultError}
                      />
                    )}
                    <span
                      className={`font-semibold px-2.5 py-1 rounded-full ${
                        cat.active
                          ? "text-teal-700 bg-teal-50"
                          : "text-slate-600 bg-slate-100"
                      }`}
                    >
                      {cat.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
                {cat.points.length > 0 && (
                  <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                    {cat.points.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                )}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <p className="text-slate-500">
                    ₹{(cat.price_paise / 100).toFixed(2)} •{" "}
                    {cat.duration_minutes} min • &quot;{cat.cta_label}&quot;
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => startDuplicate(cat)}
                      className="text-[11px] text-slate-600 font-semibold hover:underline"
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={() => setEditingId(cat.id)}
                      className="text-[11px] text-teal-700 font-semibold hover:underline"
                    >
                      Edit
                    </button>
                    <DeleteButton id={cat.id} title={cat.title} />
                  </div>
                </div>
              </li>
            )
          )}
        </ul>
      )}

      {visibleCategories.length > 0 && (
        // Always on screen, and only tappable once the arrows have actually
        // changed something -- an admin who has moved nothing should still be
        // able to see that saving is the step that publishes an order, rather
        // than discovering the control only after making a change.
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            onClick={saveOrder}
            disabled={!isDirty || isSavePending}
            aria-disabled={!isDirty || isSavePending}
            className="bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed"
          >
            {isSavePending ? "Saving order..." : "Save order"}
          </button>
          {isDirty && !isSavePending && (
            <>
              <span className="text-[11px] font-semibold text-amber-700">
                Not saved yet - the public pages still show the old order.
              </span>
              <button
                onClick={discardOrder}
                className="text-[11px] text-slate-600 font-semibold hover:underline"
              >
                Undo changes
              </button>
            </>
          )}
          {savedNotice && !isDirty && !isSavePending && (
            <span className="text-[11px] font-semibold text-teal-700">
              Order saved - live on the site.
            </span>
          )}
        </div>
      )}

      {addingNew ? (
        <TreatmentCategoryForm
          takenCodes={takenCodes(null)}
          onCancel={closeAddNew}
          nextDisplayOrder={nextDisplayOrder}
          initialValues={
            duplicateFrom
              ? {
                  title: `${duplicateFrom.title} (Copy)`,
                  description: duplicateFrom.description,
                  image_url: duplicateFrom.image_url,
                  points: duplicateFrom.points,
                  price_paise: duplicateFrom.price_paise,
                  duration_minutes: duplicateFrom.duration_minutes,
                  cta_label: duplicateFrom.cta_label,
                  display_order: duplicateFrom.display_order,
                  specialty: duplicateFrom.specialty ?? null,
                  active: false,
                }
              : undefined
          }
        />
      ) : (
        <button
          onClick={startAddNew}
          className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold px-4 py-2 rounded-xl transition"
        >
          + Add Category
        </button>
      )}
    </div>
  );
}

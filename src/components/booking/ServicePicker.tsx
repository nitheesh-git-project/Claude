"use client";

import { useId, useState } from "react";
import Modal, { useLastNonNull } from "@/components/Modal";
import CatalogCard from "@/components/catalog/CatalogCard";
import CatalogDialogHeader from "@/components/catalog/CatalogDialogHeader";
import {
  CheckList,
  ProseSection,
  StatTiles,
} from "@/components/catalog/CatalogVisuals";
import ChosenServiceSummary from "@/components/booking/ChosenServiceSummary";
import type { ServiceOption } from "@/lib/serviceOptions";

/**
 * How the public booking wizards ask "which of these are you buying?".
 *
 * It replaces a native `<select>` on both. `/book` offered one line per
 * option - `Back & Neck Pain - ₹1,200 / 45 min` - in Step 2, *after* the
 * patient had already chosen a date and an hour; `/book-home-visit` offered
 * the same in Step 3 and did not render it at all when only one package was
 * sellable, so that patient reached the payment screen never having seen
 * what they had bought. Neither screen showed a photograph or a word of
 * description, although every other catalogue surface in this app -
 * `/conditions`, `/home-visit` and the patient's own booking screen - shows
 * both.
 *
 * Four things about the shape are load-bearing.
 *
 * **One dialog, two views, and never two dialogs.** Reading the detail of an
 * option swaps this dialog's contents and offers a way back, rather than
 * opening a second sheet over the first. `Modal` is not portalled and sets
 * `backdrop-blur-sm`, which makes it the containing block for any `fixed`
 * descendant - so a nested overlay would be measured against this panel's
 * scrolling box rather than the viewport, which is the failure `OverlayPortal`
 * exists to fix elsewhere. It is also the better reading: two stacked sheets
 * leave somebody unsure which Escape closes what, and this codebase already
 * answers that with one-at-a-time plus an explicit way back.
 *
 * **The cards are the app's own cards.** `CatalogCard` in select mode, so a
 * service looks the same here as it does on the marketing pages and on the
 * dashboard. A second card would be a second idea of what the clinic sells.
 *
 * **Choosing is a button, not a link.** The patient is standing inside a
 * wizard holding a date, an hour and a language in React state; navigating
 * anywhere would throw all of it away.
 *
 * **With one option there is no dialog at all.** A picker that opens to show
 * a single card asks somebody to tap twice to confirm the only thing on
 * offer. The option is stated instead, as chosen, with its photograph and its
 * price and a way to read the rest - which is still strictly more than the
 * old `<select>` gave, since it rendered nothing whatsoever in that case.
 */
export default function ServicePicker({
  options,
  value,
  onChange,
  label,
  browseHeading,
  browseBlurb,
  chooseLabel,
  aboutTitle,
  emptyMessage,
  singleOptionNote,
}: {
  options: ServiceOption[];
  /** The chosen option's id, or "" for none. Owned by the wizard, because
   *  the wizard is what sends it to the server. */
  value: string;
  onChange: (id: string) => void;
  /** The field label above the control. */
  label: string;
  /** The dialog's own heading, which is a question rather than a label. */
  browseHeading: string;
  /** One line under it. Takes the count, so it is built by the caller. */
  browseBlurb: (count: number) => string;
  /** "Choose this session" / "Choose this visit". */
  chooseLabel: string;
  /** Heading over the description in the detail view - "About this session",
   *  "About this visit". Worded by the caller for the same reason
   *  `chooseLabel` is: only it knows which catalogue this is. */
  aboutTitle: string;
  /** Shown in place of the control when the catalogue is empty. Kept as a
   *  prop because each wizard already had its own wording for this and both
   *  were correct. */
  emptyMessage: string;
  /** Shown under the card when there is exactly one option and so no choice
   *  to make. Null to say nothing. */
  singleOptionNote?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  // One id per view, so the dialog is always named by the heading actually on
  // screen rather than by whichever one happened to render first.
  const browseTitleId = useId();
  const detailTitleId = useId();

  const chosen = options.find((o) => o.id === value) ?? null;
  // Holds the row through the dialog's exit animation, so the panel does not
  // blank out as it leaves. Same helper `ProgramCards` uses.
  const detailOption = useLastNonNull(options.find((o) => o.id === detailId) ?? null);

  if (options.length === 0) {
    return (
      <div>
        <span className="mb-1.5 block font-semibold text-slate-900">{label}</span>
        <p className="text-xs text-red-600">{emptyMessage}</p>
      </div>
    );
  }

  const only = options.length === 1 ? options[0] : null;

  function openBrowse() {
    setDetailId(null);
    setOpen(true);
  }

  function openDetail(id: string) {
    setDetailId(id);
    setOpen(true);
  }

  function choose(id: string) {
    onChange(id);
    setOpen(false);
    setDetailId(null);
  }

  function cardData(option: ServiceOption) {
    return {
      id: option.id,
      title: option.title,
      summary: option.summary,
      imageUrl: option.imageUrl,
      focalX: option.focalX,
      focalY: option.focalY,
      badge: option.badge,
      highlight: option.highlight,
      meta: option.meta,
      points: option.points,
      pricePaise: option.pricePaise,
      compareAtPaise: option.compareAtPaise,
      savingsPaise: option.savingsPaise,
      priceUnit: option.priceUnit,
      icon: option.icon,
    };
  }

  return (
    <div>
      <span className="mb-1.5 block font-semibold text-slate-900">{label}</span>

      {chosen ? (
        <ChosenServiceSummary
          option={chosen}
          actions={
            <>
              {/* With one option there is nothing to change to, so the
                  control that would open a one-card dialog is not offered. */}
              {!only && (
                <button
                  type="button"
                  onClick={openBrowse}
                  aria-haspopup="dialog"
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-teal-400 hover:bg-teal-50 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                >
                  Change
                </button>
              )}
              <button
                type="button"
                onClick={() => openDetail(chosen.id)}
                aria-haspopup="dialog"
                className="rounded-lg px-2 py-1 text-[11.5px] font-bold text-teal-700 transition hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
              >
                View details
              </button>
            </>
          }
        />
      ) : (
        <button
          type="button"
          onClick={openBrowse}
          aria-haspopup="dialog"
          className="flex w-full items-center gap-3.5 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-left transition hover:border-teal-400 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-700">
            <i aria-hidden className="fa-solid fa-layer-group" />
          </span>
          <span className="min-w-0">
            <span className="block font-bold text-slate-900">{browseHeading}</span>
            <span className="block text-xs text-slate-500">{browseBlurb(options.length)}</span>
          </span>
          <span aria-hidden className="ml-auto text-teal-700">
            <i className="fa-solid fa-chevron-right" />
          </span>
        </button>
      )}

      {only && singleOptionNote && (
        <p className="mt-1.5 text-xs text-slate-500">{singleOptionNote}</p>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        labelledBy={detailId ? detailTitleId : browseTitleId}
        closeLabel={detailId ? "Close service details" : "Close the service list"}
        closeTone={detailId && detailOption?.imageUrl ? "dark" : "light"}
      >
        {detailId && detailOption ? (
          <>
            <CatalogDialogHeader
              titleId={detailTitleId}
              title={detailOption.title}
              eyebrow={detailOption.eyebrow}
              badge={detailOption.badge}
              subtitle={detailOption.summary}
              imageUrl={detailOption.imageUrl}
              focalX={detailOption.focalX}
              focalY={detailOption.focalY}
              icon={detailOption.icon}
            />
            <div className="px-6 py-6 sm:px-8">
              <StatTiles items={detailOption.stats} />
              {/* Only when it says something the subtitle above has not
                  already said: a treatment category has one description
                  column, so it is both the line under the heading and the
                  longer read, and printing it twice reads as a mistake. */}
              {detailOption.about !== detailOption.summary && (
                <ProseSection title={aboutTitle} body={detailOption.about} />
              )}
              <CheckList items={detailOption.points} title="What this covers" />
              <ProseSection title="Terms" body={detailOption.terms} />

              <div className="mt-7 flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center">
                {/* The way back is a real control rather than an expectation
                    that somebody will press Escape and start again. */}
                <button
                  type="button"
                  onClick={() => setDetailId(null)}
                  className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-teal-400 hover:bg-teal-50 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                >
                  &larr; Back to all services
                </button>
                <button
                  type="button"
                  onClick={() => choose(detailOption.id)}
                  aria-pressed={detailOption.id === value}
                  className={`flex-1 rounded-xl px-5 py-3 text-sm font-bold text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 ${
                    detailOption.id === value
                      ? "bg-slate-900 hover:bg-slate-800"
                      : "bg-teal-700 hover:bg-teal-800"
                  }`}
                >
                  {detailOption.id === value ? "Chosen - close" : chooseLabel}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="px-6 pt-7 sm:px-8">
              <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-teal-700">
                Step 1 &middot; your service
              </span>
              <h3
                id={browseTitleId}
                className="font-display mt-1 text-2xl font-extrabold leading-tight text-slate-900"
              >
                {browseHeading}
              </h3>
              <p className="mt-1.5 text-sm text-slate-600">{browseBlurb(options.length)}</p>
            </div>
            <div className="grid gap-3.5 px-6 pb-7 pt-5 sm:grid-cols-2 sm:px-8">
              {options.map((option) => (
                <CatalogCard
                  key={option.id}
                  data={cardData(option)}
                  onSelect={() => choose(option.id)}
                  selected={option.id === value}
                  selectLabel={chooseLabel}
                  onOpenDetails={() => openDetail(option.id)}
                />
              ))}
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

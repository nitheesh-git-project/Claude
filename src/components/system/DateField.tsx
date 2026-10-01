"use client";

import { useId, useState } from "react";
import BookingCalendar from "@/components/booking/BookingCalendar";
import OverlayPortal from "@/components/system/OverlayPortal";
import { useDialogChrome } from "@/lib/useDialogChrome";
import { formatDateKeyMedium, toDateKey } from "@/lib/bookingSlots";
import {
  buildDateValue,
  formatClockLabel,
  parseDateValue,
} from "@/lib/dateFieldValue";
import { CalendarOutlineGlyph } from "@/components/visuals/BrandGlyphs";

// The app's one date control, replacing `<input type="date">` and
// `<input type="datetime-local">` everywhere.
//
// A native date box opens the **operating system's** own picker: unstyled,
// worded differently and placed differently on every browser and every phone,
// and the one piece of UI in this product nobody designed. It is the same
// failure `FormValidationChrome` was written for one control over -- something
// that arrives free with an attribute and then speaks to a person in a voice
// that is not the clinic's.
//
// Four things about this are load-bearing:
//
// 1. **It emits exactly what the native control emitted.** `YYYY-MM-DD`, or
//    `YYYY-MM-DDTHH:mm` with `withTime`. Every call site's state, query string
//    and `new Date(value)` on the far side is unchanged, which is what made
//    replacing 28 of them in one go safe: this moves what a person sees and
//    nothing else.
// 2. **It reuses `BookingCalendar`,** the only month grid in the app, through
//    that component's `bounds` prop -- so a filter reaching into last year and
//    a booking picker offering next week are one grid with one idea of which
//    days exist. A second calendar is how the two drift.
// 3. **It is a real dialog,** portalled through `OverlayPortal` and carrying
//    `useDialogChrome`. Portalled because any modal in this app sets
//    `backdrop-blur-sm` and would otherwise become the containing block for a
//    popover opened inside it -- several of these fields live inside modals.
//    Anchored positioning was rejected: it needs measuring, it breaks at 360px
//    where the grid is already the width of the screen, and a centred sheet is
//    what every other overlay here already is.
// 4. **Empty is a value.** Most of the call sites are filters and a campaign
//    window where "no date" is the ordinary state, so the field renders a
//    placeholder rather than today, and `clearable` puts Clear in the footer.
//    Defaulting an unset filter to today would silently apply one nobody set.
export default function DateField({
  value,
  onChange,
  label,
  ariaLabel,
  id,
  minDateKey,
  maxDateKey,
  maxToday = false,
  withTime = false,
  clearable = true,
  disabled = false,
  placeholder = "Any date",
  className = "",
  /** The dialog's heading, when the visible label is not the right wording for
   *  it. Defaults to the label. */
  dialogTitle,
}: {
  value: string | null | undefined;
  onChange: (next: string) => void;
  label?: string;
  /** For the filter rows that print their own word ("From", "To") beside the
   *  control. A `<label>` cannot label a button, so the association is this
   *  rather than `htmlFor` -- and a control with no accessible name at all is
   *  the regression this codebase has already swept for twice. */
  ariaLabel?: string;
  id?: string;
  minDateKey?: string | null;
  maxDateKey?: string | null;
  /** Nothing after today. A prop rather than the caller passing a computed
   *  `maxDateKey`, because working out "today" means reading the clock, and a
   *  clock read during a render is impure -- this component already reads one
   *  when the picker opens, so the bound is resolved there. */
  maxToday?: boolean;
  withTime?: boolean;
  clearable?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  dialogTitle?: string;
}) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const titleId = `${fieldId}-dialog-title`;
  const [open, setOpen] = useState(false);

  const parsed = parseDateValue(value);
  // Draft state, so Cancel is a real answer and a half-made choice never
  // reaches the caller. `key`ed off the value below rather than synced in an
  // effect -- the dialog is only ever opened fresh.
  const [draftDate, setDraftDate] = useState<string | null>(parsed.dateKey);
  const [draftHour, setDraftHour] = useState<number>(parsed.hour ?? 0);
  const [draftMinute, setDraftMinute] = useState<number>(parsed.minute ?? 0);

  // The clock is read when the picker is **opened**, not during render and not
  // in an effect: render must stay pure, and the server has no honest value for
  // "now" anyway -- it is in a different zone from the reader. Opening is a real
  // event, and the grid needs the clock only to mark today.
  const [nowMs, setNowMs] = useState<number | null>(null);

  function openPicker() {
    const current = parseDateValue(value);
    setDraftDate(current.dateKey);
    setDraftHour(current.hour ?? 0);
    setDraftMinute(current.minute ?? 0);
    setNowMs(Date.now());
    setOpen(true);
  }

  function commit(dateKey: string | null, hour: number, minute: number) {
    onChange(buildDateValue(dateKey, hour, minute, withTime));
    setOpen(false);
  }

  const shown = parsed.dateKey
    ? withTime && parsed.hour !== null
      ? `${formatDateKeyMedium(parsed.dateKey)}, ${formatClockLabel(parsed.hour, parsed.minute ?? 0)}`
      : formatDateKeyMedium(parsed.dateKey)
    : null;

  return (
    <>
      {label && (
        <label
          htmlFor={fieldId}
          className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1"
        >
          {label}
        </label>
      )}
      <button
        type="button"
        id={fieldId}
        disabled={disabled}
        onClick={openPicker}
        aria-label={ariaLabel}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-2 py-2 text-left text-xs text-slate-800 transition hover:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${className}`}
      >
        <span className={shown ? "" : "text-slate-500"}>{shown ?? placeholder}</span>
        <CalendarOutlineGlyph className="text-slate-500" />
      </button>

      {open && nowMs !== null && (
        <DateFieldDialog
          titleId={titleId}
          title={dialogTitle ?? label ?? "Choose a date"}
          nowMs={nowMs}
          draftDate={draftDate}
          setDraftDate={setDraftDate}
          draftHour={draftHour}
          setDraftHour={setDraftHour}
          draftMinute={draftMinute}
          setDraftMinute={setDraftMinute}
          minDateKey={minDateKey}
          maxDateKey={maxToday ? toDateKey(new Date(nowMs)) : maxDateKey}
          withTime={withTime}
          clearable={clearable}
          onCancel={() => setOpen(false)}
          onClear={() => commit(null, 0, 0)}
          onDone={() => commit(draftDate, draftHour, draftMinute)}
        />
      )}
    </>
  );
}

const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function DateFieldDialog({
  titleId,
  title,
  nowMs,
  draftDate,
  setDraftDate,
  draftHour,
  setDraftHour,
  draftMinute,
  setDraftMinute,
  minDateKey,
  maxDateKey,
  withTime,
  clearable,
  onCancel,
  onClear,
  onDone,
}: {
  titleId: string;
  title: string;
  nowMs: number;
  draftDate: string | null;
  setDraftDate: (v: string) => void;
  draftHour: number;
  setDraftHour: (v: number) => void;
  draftMinute: number;
  setDraftMinute: (v: number) => void;
  minDateKey?: string | null;
  maxDateKey?: string | null;
  withTime: boolean;
  clearable: boolean;
  onCancel: () => void;
  onClear: () => void;
  onDone: () => void;
}) {
  const { panelRef, dialogProps } = useDialogChrome({
    onClose: onCancel,
    labelledBy: titleId,
  });
  const todayKey = toDateKey(new Date(nowMs));

  return (
    <OverlayPortal>
      <div
        className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onCancel();
        }}
      >
        <div
          ref={panelRef}
          {...dialogProps}
          className="w-full max-w-sm rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <h2 id={titleId} className="font-display text-sm font-bold text-slate-900">
              {title}
            </h2>
            <button
              type="button"
              onClick={onCancel}
              aria-label="Close"
              className="rounded-lg px-2 py-1 text-slate-500 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            >
              <i className="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </div>

          <BookingCalendar
            compact
            selectedDateKey={draftDate ?? ""}
            onSelect={setDraftDate}
            nowMs={nowMs}
            autoSelected={false}
            gridLabel={title}
            bounds={{ minDateKey, maxDateKey }}
          />

          {withTime && (
            <div className="mt-3 flex items-end gap-2">
              <label className="block text-xs">
                <span className="mb-1 block font-semibold text-slate-600">Hour</span>
                <select
                  value={draftHour}
                  onChange={(e) => setDraftHour(Number(e.target.value))}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {formatClockLabel(h, 0).replace(":00", "")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs">
                <span className="mb-1 block font-semibold text-slate-600">Minutes</span>
                <select
                  value={draftMinute}
                  onChange={(e) => setDraftMinute(Number(e.target.value))}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                >
                  {/* The stored minute is offered even when it is not one of
                      the twelve -- a campaign saved at 14:07 through the old
                      native box must not be silently moved to 14:05 by opening
                      the picker that replaced it. */}
                  {(MINUTES.includes(draftMinute) ? MINUTES : [...MINUTES, draftMinute].sort((a, b) => a - b)).map(
                    (m) => (
                      <option key={m} value={m}>
                        {String(m).padStart(2, "0")}
                      </option>
                    )
                  )}
                </select>
              </label>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDraftDate(todayKey)}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
              >
                Today
              </button>
              {clearable && (
                <button
                  type="button"
                  onClick={onClear}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onDone}
                disabled={!draftDate}
                className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}

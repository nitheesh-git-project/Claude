// Single source of truth for the look of every selectable cell in /book
// Step 1 -- calendar dates, time slots and language options. They're three
// different components with three different data shapes, but to a patient
// they're one consistent control, so the classes live here rather than
// being re-typed (and drifting) in each.
//
// States, in the order they're resolved below:
//   disabled  -- present but plainly out of reach (muted fill, struck through)
//   selected  -- filled teal with a soft outer halo, the design's focal state
//   available -- white card, lifts slightly toward teal on hover

const BASE =
  "flex items-center justify-center text-center rounded-xl border font-bold " +
  "transition-all duration-200 ease-out select-none " +
  // The halo on the selected state is drawn with ring + ring-offset, so the
  // offset colour has to match the surface these sit on (white cards).
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 ring-offset-white";

const AVAILABLE =
  "bg-white border-slate-200 text-slate-700 shadow-sm " +
  "hover:border-teal-400 hover:text-teal-800 hover:shadow-md hover:-translate-y-px " +
  "active:translate-y-0 cursor-pointer";

const SELECTED =
  "bg-teal-700 border-teal-700 text-white shadow-md " +
  "ring-2 ring-teal-200 ring-offset-2 cursor-pointer";

const DISABLED =
  "bg-slate-50 border-slate-100 text-slate-300 line-through cursor-not-allowed shadow-none";

export function bookingCellClass({
  selected,
  disabled,
}: {
  selected: boolean;
  disabled: boolean;
}): string {
  // Disabled wins over selected: a cell can't be both, and if state ever
  // did contradict itself the safer render is the non-interactive one.
  const state = disabled ? DISABLED : selected ? SELECTED : AVAILABLE;
  return `${BASE} ${state}`;
}

// Equal-width, equal-height option grid shared by the time and language
// pickers. Column counts step up with the viewport so cells stay a
// comfortable tap size on phones and never stretch absurdly wide on
// desktop; `auto-rows-fr` keeps every row the same height even when one
// label wraps.
export const BOOKING_OPTION_GRID =
  "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 auto-rows-fr";

// Cell height/typography for the time + language grids. Comfortably above
// the 44px minimum touch target at every breakpoint.
export const BOOKING_OPTION_CELL = "min-h-12 px-3 py-3 text-xs sm:text-sm";

// Calendar days are a fixed 7-column grid, so they get their own sizing
// while sharing the same state colours above. A 390px phone leaves roughly
// 38px of width per column once the card and grid gaps are accounted for --
// there is no layout that yields a 44px-wide cell in a 7-column month grid
// at that width -- so the extra height buys back touch area instead.
export const BOOKING_DAY_CELL = "h-12 sm:h-12 w-full text-xs sm:text-sm";

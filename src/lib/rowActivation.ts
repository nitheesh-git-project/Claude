/**
 * A table row or list item that opens something when you tap it.
 *
 * Nine of them shipped as `<tr onClick={...}>` and `<li onClick={...}>` with
 * nothing else: no tab stop, no key handler, and -- in every one of the nine
 * -- no focusable child that did the same job. A mouse opened the detail
 * dialog and a keyboard could not open it at all, which on Logs -> All
 * Activity meant the dialog saying what changed from what was unreachable
 * without a pointing device, and on Sessions -> All Sessions the same for the
 * drawer that assigns, reschedules and refunds.
 *
 * Three decisions are load-bearing:
 *
 * 1. **The element keeps its own role.** No `role="button"` on a `<tr>`: that
 *    takes the row out of the table for a screen reader, so a fix for one
 *    group of people would cost another the column headers, the row/column
 *    position and table navigation altogether. A tab stop plus Enter/Space is
 *    what the row was missing; its semantics were never the problem.
 *    `aria-haspopup="dialog"` states what activating it does, which is the
 *    part that was genuinely unannounced.
 * 2. **A key press on a descendant is left alone.** These rows carry their
 *    own controls -- a chip, a link, a cell that stops propagation -- and a
 *    Space on a button inside the row belongs to that button. The handler
 *    returns unless the event is on the row itself, the keyboard counterpart
 *    of the `stopPropagation()` those cells already do for clicks.
 * 3. **Space is prevented, Enter is not.** Space scrolls the page by default,
 *    and a row that opened a dialog *and* jumped the page underneath it would
 *    be worse than the one that did nothing.
 *
 * Returns props rather than a component so it fits `<tr>`, `<li>` and
 * whatever the next one is, without a wrapper element changing any layout.
 * Spread it in place of the bare `onClick`.
 */
export type RowActivationProps<E extends HTMLElement> = {
  tabIndex: 0;
  "aria-haspopup": "dialog";
  onClick: () => void;
  onKeyDown: (event: RowKeyboardEvent<E>) => void;
};

/** The shape this helper needs from React's keyboard event, and no more --
 *  keeping the module dependency-free so it can be unit-tested like the rest
 *  of `src/lib`. Any `React.KeyboardEvent` satisfies it. */
export type RowKeyboardEvent<E> = {
  key: string;
  target: EventTarget | null;
  currentTarget: E;
  preventDefault: () => void;
};

export function rowActivationProps<E extends HTMLElement>(
  onActivate: () => void
): RowActivationProps<E> {
  return {
    tabIndex: 0,
    "aria-haspopup": "dialog",
    onClick: onActivate,
    onKeyDown: (event) => {
      // A key pressed on a control inside the row is that control's.
      if (event.target !== event.currentTarget) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      onActivate();
    },
  };
}

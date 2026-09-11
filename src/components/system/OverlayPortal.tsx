"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Renders a full-screen overlay into `document.body`, out of whatever it was
 * declared inside.
 *
 * `position: fixed` is normally relative to the viewport -- but an ancestor
 * carrying `transform`, `filter`, `backdrop-filter`, `perspective`,
 * `contain` or `will-change` becomes the **containing block** for its fixed
 * descendants, and the overlay is then sized and placed against *that box*
 * instead.
 *
 * Every modal in this app sets `backdrop-blur-sm`, which is a
 * `backdrop-filter`. So a confirmation opened from inside one -- Mark Done
 * on a patient's profile, which renders inside `DetailOverlayModal` -- was
 * laid out against that modal's own scrolling panel: the dark sheet covered
 * only part of the screen, the prompt sat at the top of the scrolled content
 * rather than in front of the reader, and it slid away as they scrolled.
 * Nothing was wrong with the dialog; it was being measured against the wrong
 * box.
 *
 * Portalling to `document.body` removes every such ancestor, so `fixed`
 * means the viewport again and the overlay stays centred on screen wherever
 * the page is scrolled to.
 *
 * React portals still bubble events along the **React** tree, not the DOM
 * one, so a dialog opened inside a panel that stops propagation keeps
 * behaving exactly as it did -- this changes where the pixels go, not what
 * the clicks do.
 */
export default function OverlayPortal({ children }: { children: ReactNode }) {
  // `document` does not exist during the server render. This is React's own
  // "am I still on the server" read -- a store that never changes, whose
  // server snapshot is true -- rather than a `useState` flipped in an
  // effect, which sets state during render in the eyes of the hook lint and
  // costs an extra commit.
  //
  // Every overlay that uses this is opened by a tap, so it is never in the
  // server-rendered HTML and there is nothing to flash. A server-rendered
  // overlay (the admin's `@modal` detail routes) must **not** be portalled
  // this way: it would render nothing on the server and appear only after
  // hydration.
  const isServer = useSyncExternalStore(
    () => () => {},
    () => false,
    () => true
  );
  if (isServer) return null;
  return createPortal(children, document.body);
}

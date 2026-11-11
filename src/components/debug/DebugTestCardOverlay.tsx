"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { isRazorpayTestKey } from "@/lib/debugTestAccounts";
import { TestCardRows } from "@/components/debug/DebugTestAccountsPanel";

/**
 * The test card, floating over Razorpay's checkout while it is open.
 *
 * Razorpay's card form is an iframe on Razorpay's own origin; no page may
 * type into it. So while the checkout is up, this box sits above it with a
 * copy button per value: tap copy, tap the field, paste. Only against a
 * test key -- on a live key the card would be declined -- and only while the
 * debug bar exists, since this is mounted by it.
 *
 * Razorpay puts its checkout in `.razorpay-container` at the end of <body>
 * with the largest z-index there is, so this box is portalled into a node
 * appended *after* it: equal z-index, later in the document, drawn on top.
 */
export default function DebugTestCardOverlay() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!isRazorpayTestKey(process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID)) return;
    let node: HTMLElement | null = null;
    const check = () => {
      const container = document.querySelector<HTMLElement>(".razorpay-container");
      const visible = !!container && container.style.display !== "none" && container.offsetParent !== null;
      if (visible && !node) {
        node = document.createElement("div");
        node.setAttribute("data-debug-test-card-host", "");
        document.body.appendChild(node);
        setHost(node);
      } else if (!visible && node) {
        node.remove();
        node = null;
        setHost(null);
      } else if (visible && node && node !== document.body.lastElementChild) {
        document.body.appendChild(node);
      }
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style"] });
    check();
    return () => {
      observer.disconnect();
      node?.remove();
    };
  }, []);

  if (!host) return null;
  return createPortal(
    <div
      style={{ zIndex: 2147483647 }}
      className="fixed bottom-3 left-3 w-[min(18rem,calc(100vw-1.5rem))] rounded-xl border border-amber-300 bg-white p-3 text-xs text-slate-800 shadow-2xl"
      data-testid="debug-test-card-overlay"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold">
          <span className="mr-1.5 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] uppercase text-slate-950">Debug</span>
          <span>Test card</span>
        </p>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          className="rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
        >
          {collapsed ? "Show" : "Hide"}
        </button>
      </div>
      {!collapsed && <TestCardRows />}
    </div>,
    host
  );
}

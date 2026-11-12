"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_ADMIN_SETTINGS } from "@/lib/adminSettings";

// The clinic's two cancellation refund windows (hours), handed to the admin's
// session drawer so its cancel dialog quotes the window actually in force
// rather than a constant. Same delivery as JoinWindowProvider and for the
// same reason: the drawer is rendered by six screens and two person pages,
// and threading two numbers through every one of them is how a screen ends up
// quoting a default. The defaults are the fallback; each admin page that
// renders the drawer reads site_settings and wraps its tree once.
export type CancellationWindows = {
  onlineHours: number;
  homeVisitHours: number;
};

const CancellationWindowContext = createContext<CancellationWindows>({
  onlineHours: DEFAULT_ADMIN_SETTINGS.onlineCancellationRefundHours,
  homeVisitHours: DEFAULT_ADMIN_SETTINGS.homeVisitCancellationRefundHours,
});

export function CancellationWindowProvider({
  onlineHours,
  homeVisitHours,
  children,
}: CancellationWindows & { children: ReactNode }) {
  return (
    <CancellationWindowContext.Provider value={{ onlineHours, homeVisitHours }}>
      {children}
    </CancellationWindowContext.Provider>
  );
}

export function useCancellationWindows(): CancellationWindows {
  return useContext(CancellationWindowContext);
}

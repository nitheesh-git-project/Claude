"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_ADMIN_SETTINGS } from "@/lib/adminSettings";

export type JoinWindow = {
  beforeMinutes: number;
  afterMinutes: number;
  // Minutes after slot_time at which the control stops offering a call and
  // reads "Session Completed". Unlike the two above, this one applies on
  // admin surfaces too -- see JoinSessionButton.
  completedAfterMinutes: number;
};

// Carries the admin-configured Join button activation window (minutes
// before slot_time, minutes after slot_time + duration) and the point a
// session reads as completed (minutes after slot_time) down to every
// JoinSessionButton instance without prop-drilling through the many nested
// components that render one (SessionDetailDrawer, ProfileSessionList,
// AdminCalendarTab, AdminSessionStoryTab, SessionCalendarTab...). Each
// top-level dashboard page/admin detail page fetches site_settings once and
// wraps its JSX in a single Provider; everything underneath just reads the
// context. Admin's own JoinSessionButton instances pass alwaysActive and
// ignore the *window* -- but not completedAfterMinutes, which applies to
// every surface a session is listed on. See JoinSessionButton's comment.
const JoinWindowContext = createContext<JoinWindow>({
  beforeMinutes: DEFAULT_ADMIN_SETTINGS.joinWindowMinutes,
  afterMinutes: DEFAULT_ADMIN_SETTINGS.joinWindowAfterMinutes,
  completedAfterMinutes: DEFAULT_ADMIN_SETTINGS.sessionCompletedAfterMinutes,
});

export function JoinWindowProvider({
  beforeMinutes,
  afterMinutes,
  completedAfterMinutes = DEFAULT_ADMIN_SETTINGS.sessionCompletedAfterMinutes,
  children,
}: {
  beforeMinutes: number;
  afterMinutes: number;
  completedAfterMinutes?: number;
  children: ReactNode;
}) {
  return (
    <JoinWindowContext.Provider value={{ beforeMinutes, afterMinutes, completedAfterMinutes }}>
      {children}
    </JoinWindowContext.Provider>
  );
}

export function useJoinWindow() {
  return useContext(JoinWindowContext);
}

"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_ADMIN_SETTINGS } from "@/lib/adminSettings";

export type JoinWindow = { beforeMinutes: number; afterMinutes: number };

// Carries the admin-configured Join button activation window (minutes
// before slot_time, minutes after slot_time + duration) down to every
// JoinSessionButton instance without prop-drilling through the many nested
// components that render one (SessionDetailDrawer, ProfileSessionList,
// AdminCalendarTab, AdminSessionStoryTab, SessionCalendarTab...). Each
// top-level dashboard page/admin detail page fetches site_settings once and
// wraps its JSX in a single Provider; everything underneath just reads the
// context. Admin's own JoinSessionButton instances pass alwaysActive and
// never consult this window at all -- see JoinSessionButton's own comment.
const JoinWindowContext = createContext<JoinWindow>({
  beforeMinutes: DEFAULT_ADMIN_SETTINGS.joinWindowMinutes,
  afterMinutes: DEFAULT_ADMIN_SETTINGS.joinWindowAfterMinutes,
});

export function JoinWindowProvider({
  beforeMinutes,
  afterMinutes,
  children,
}: {
  beforeMinutes: number;
  afterMinutes: number;
  children: ReactNode;
}) {
  return (
    <JoinWindowContext.Provider value={{ beforeMinutes, afterMinutes }}>
      {children}
    </JoinWindowContext.Provider>
  );
}

export function useJoinWindow() {
  return useContext(JoinWindowContext);
}

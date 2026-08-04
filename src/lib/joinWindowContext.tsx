"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_ADMIN_SETTINGS } from "@/lib/adminSettings";

// Carries the admin-configured "minutes before slot_time" Join button
// activation window down to every JoinSessionButton instance without
// prop-drilling through the many nested components that render one
// (SessionDetailDrawer, ProfileSessionList, AdminCalendarTab,
// AdminSessionStoryTab, SessionCalendarTab...). Each top-level dashboard
// page/admin detail page fetches site_settings once and wraps its JSX in a
// single Provider; everything underneath just reads the context.
const JoinWindowContext = createContext<number>(DEFAULT_ADMIN_SETTINGS.joinWindowMinutes);

export function JoinWindowProvider({ minutes, children }: { minutes: number; children: ReactNode }) {
  return <JoinWindowContext.Provider value={minutes}>{children}</JoinWindowContext.Provider>;
}

export function useJoinWindowMinutes() {
  return useContext(JoinWindowContext);
}

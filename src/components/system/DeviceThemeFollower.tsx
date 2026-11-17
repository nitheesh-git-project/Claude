"use client";

import { useEffect } from "react";
import { DARK_QUERY, themeFor, type ThemeMode } from "@/lib/deviceTheme";

/**
 * Keeps `<html data-theme>` in step with the device after the first paint.
 * The boot script in the root layout set it before anything drew; this
 * follows a change made while the page is open, and clears it if the admin
 * has switched the feature off since this page was rendered.
 */
export default function DeviceThemeFollower({ mode }: { mode: ThemeMode }) {
  useEffect(() => {
    const root = document.documentElement;
    const apply = (deviceIsDark: boolean) => {
      if (themeFor(mode, deviceIsDark) === "dark") root.dataset.theme = "dark";
      else delete root.dataset.theme;
    };
    if (mode !== "device" || !window.matchMedia) {
      apply(false);
      return;
    }
    const media = window.matchMedia(DARK_QUERY);
    apply(media.matches);
    const onChange = (e: MediaQueryListEvent) => apply(e.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [mode]);
  return null;
}

// Light, dark, or the visitor's own device -- Settings -> Public Site ->
// Appearance (site_settings.site_theme).
//
//   light  -- the light design everywhere (the app as it always was)
//   dark   -- the dark palette in src/app/dark-theme.css everywhere
//   device -- dark on a device set to dark, light otherwise, following the
//             device live when it changes
//
// `site_theme` is newer than the old on/off switch (follow_device_theme): a
// database where nobody has picked yet keeps what that switch meant (on ->
// device, off -> light), so adding the column changes nothing on its own.
//
// The palette keys off one attribute, `<html data-theme="dark">`, set in
// two places that must agree: the boot script below, inlined in <head> so
// the first paint is already the right colour (an effect would flash white
// first on every page load), and DeviceThemeFollower, which keeps it in step
// afterwards. Printing, receipts, exports and emails stay light either way.

export const DARK_QUERY = "(prefers-color-scheme: dark)";

export const THEME_MODES = ["light", "dark", "device"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && (THEME_MODES as readonly string[]).includes(value);
}

/** The mode in force: the picked one, else what the old switch meant. */
export function resolveThemeMode(siteTheme: unknown, followDevice: unknown): ThemeMode {
  if (isThemeMode(siteTheme)) return siteTheme;
  return followDevice === true ? "device" : "light";
}

/** The inline <head> script. Empty for light, so nothing at all can set the
 *  attribute the dark palette paints on. */
export function deviceThemeBootScript(mode: ThemeMode): string {
  if (mode === "light") return "";
  if (mode === "dark") return `(function(){document.documentElement.dataset.theme="dark"})();`;
  return `(function(){try{if(window.matchMedia&&window.matchMedia(${JSON.stringify(DARK_QUERY)}).matches){document.documentElement.dataset.theme="dark"}}catch(e){}})();`;
}

/** What the attribute should be for a mode and a device preference. */
export function themeFor(mode: ThemeMode, deviceIsDark: boolean): "dark" | "light" {
  if (mode === "dark") return "dark";
  if (mode === "device" && deviceIsDark) return "dark";
  return "light";
}

// Light or dark, decided by the device -- when an admin allows it.
//
// Settings -> Public Site -> Appearance ("Follow the device's light/dark
// setting", site_settings.follow_device_theme). Off, the default, is the app
// as it always was: light everywhere. On, a device set to dark gets the dark
// palette in src/app/dark-theme.css, and the page follows the device live
// when it changes -- the evening switch, or a person flipping it by hand.
//
// The palette keys off one attribute, `<html data-theme="dark">`, set in
// two places that must agree: the boot script below, inlined in <head> so
// the first paint is already the right colour (an effect would flash white
// first on every page load), and DeviceThemeFollower, which keeps it in step
// afterwards.

export const DARK_QUERY = "(prefers-color-scheme: dark)";

/** The inline <head> script. Empty when the switch is off, so nothing at all
 *  can set the attribute the dark palette paints on. */
export function deviceThemeBootScript(followDevice: boolean): string {
  if (!followDevice) return "";
  return `(function(){try{if(window.matchMedia&&window.matchMedia(${JSON.stringify(DARK_QUERY)}).matches){document.documentElement.dataset.theme="dark"}}catch(e){}})();`;
}

/** What the attribute should be for a device preference. */
export function themeFor(followDevice: boolean, deviceIsDark: boolean): "dark" | "light" {
  return followDevice && deviceIsDark ? "dark" : "light";
}

/**
 * The brand splash the site paints over itself on a cold open.
 *
 * Everything about it is defined here - the wording, the timings, the
 * bounds the admin form and the API route both enforce, the storage keys
 * and the inline boot script - because four separate places have to agree
 * on those values and none of them can import from the others at the
 * moment they run: an inline <script> in the document head, a stylesheet,
 * a React effect, and a Postgres check constraint. A key spelled
 * differently in any one of them means the splash either never appears or
 * appears on every navigation, and neither failure throws.
 *
 * The wording and the two durations are admin-configurable
 * (Settings → Public Site → Opening Splash, `site_settings.splash_*`);
 * what is here are the defaults every caller falls back to when there is
 * no settings row, or when the database has not run the migration adding
 * those columns yet.
 */

/** The line the splash exists to say. One claim, in a patient's words. */
export const DEFAULT_SPLASH_PHRASE = "Movement Is Medicine";

/** Longest phrase an admin may save - this is one line on a phone. */
export const MAX_SPLASH_PHRASE_LENGTH = 48;

/**
 * The small line above the phrase. Stored blank by default, which means
 * "use the site name from Brand & Contact Details" - the greeting and the
 * navbar then cannot drift apart on their own. An admin who wants the
 * splash to say something the header does not fills this in.
 *
 * Shorter cap than the site name's 120, because this renders uppercase
 * with wide letter-spacing: a name that fits the navbar can still wrap to
 * three lines here.
 */
export const MAX_SPLASH_BRAND_LINE_LENGTH = 60;

/** How long the splash holds at full opacity before it starts leaving. */
export const DEFAULT_SPLASH_HOLD_SECONDS = 1.5;

/** Bounds on the hold, enforced by the form, the route and the column. */
export const MIN_SPLASH_HOLD_SECONDS = 0.5;
export const MAX_SPLASH_HOLD_SECONDS = 6;

/**
 * How long a tab must have been in the background before coming back to it
 * counts as a fresh open and replays the splash.
 *
 * It is deliberately not "any time the tab regains focus", and 0 means
 * "never replay, greet the first load only" rather than "replay every
 * time" - there is no setting for the latter, on purpose. A patient paying
 * by UPI leaves this tab for their bank's app and comes back mid-checkout;
 * so does anyone copying an OTP. Splashing over a payment in progress is
 * the one thing this must never do, so the configuration cannot express
 * it.
 */
export const DEFAULT_SPLASH_REVISIT_MINUTES = 15;

/** A day. Past this the setting is indistinguishable from "first load only". */
export const MAX_SPLASH_REVISIT_MINUTES = 1440;

/**
 * How long the fade-out runs. Deliberately *not* configurable: it is
 * written twice, here and as the transition in globals.css, and this timer
 * is what removes the overlay from the flow. An admin able to change one
 * of the two would either cut the fade short or leave an invisible sheet
 * swallowing clicks - a fade length is a design decision, not a policy.
 */
export const SPLASH_FADE_MS = 350;

/**
 * The most a public page spends under the greeting, hold and fade together.
 *
 * A patient arriving from a search result is there to find a physiotherapist,
 * not to be welcomed for a second and a half -- on a slow phone connection
 * the sheet was most of what they saw. The admin's hold is still honoured
 * where it is shorter, and still honoured in full on the dashboards (a
 * signed-in person opening their own workspace), but on the public pages the
 * hold is clipped so the sheet is gone by ~600ms.
 */
export const SPLASH_PUBLIC_TOTAL_MS = 600;

/** Trees that keep the admin's full hold: the signed-in workspaces. */
export const SPLASH_UNCAPPED_PREFIXES = [
  "/admin",
  "/patient/dashboard",
  "/therapist/dashboard",
  "/hospital/dashboard",
];

function underPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Whether this path is a public page, where the hold is clipped. */
export function splashIsCapped(pathname: string): boolean {
  return !SPLASH_UNCAPPED_PREFIXES.some((prefix) => underPrefix(pathname, prefix));
}

/**
 * The hold and fade this path gets. The CSS animation reads both as custom
 * properties on <html> (set by the boot script before first paint, and again
 * by the component on a replay), so the greeting's whole timeline is decided
 * by the stylesheet from the first frame rather than by a timer that starts
 * only after hydration -- on a slow connection the old timer started late and
 * the sheet simply stayed.
 */
export function splashTimings(
  holdMs: number,
  pathname: string
): { holdMs: number; fadeMs: number } {
  const hold = Number.isFinite(holdMs) ? Math.max(0, Math.round(holdMs)) : DEFAULT_SPLASH_CONFIG.holdMs;
  const cap = Math.max(0, SPLASH_PUBLIC_TOTAL_MS - SPLASH_FADE_MS);
  return {
    holdMs: splashIsCapped(pathname) ? Math.min(hold, cap) : hold,
    fadeMs: SPLASH_FADE_MS,
  };
}

/** The custom properties the stylesheet's animation reads. */
export const SPLASH_HOLD_VAR = "--splash-hold";
export const SPLASH_FADE_VAR = "--splash-fade";

/** Marks that this tab has already been greeted, so a reload stays quiet. */
export const SPLASH_SHOWN_KEY = "dpp.splash.shown";

/** When this tab was last hidden, so a return can be measured against it. */
export const SPLASH_HIDDEN_AT_KEY = "dpp.splash.hiddenAt";

/**
 * The attribute on <html> that drives the whole thing. "on" is holding,
 * absent is gone. ("leaving" is no longer written: the stylesheet's own
 * animation does the fade, started by "on" and timed by the two custom
 * properties below, so nothing waits on hydration.) Kept in CSS rather than React
 * state so the markup the server sends and the markup React hydrates are
 * identical - the overlay is in the HTML from the first byte, and only
 * this attribute decides whether it is painted.
 */
export const SPLASH_ATTR = "data-splash";

/** What the root layout resolves out of site_settings and hands around. */
export type SplashConfig = {
  enabled: boolean;
  /** Already resolved: the override when set, the site name otherwise. */
  brandLine: string;
  phrase: string;
  holdMs: number;
  /** 0 means the greeting never replays on a return to the tab. */
  revisitAwayMs: number;
};

export const DEFAULT_SPLASH_CONFIG: SplashConfig = {
  enabled: true,
  // No default of its own: the root layout resolves this from the site name
  // when the override is blank, and the site name has its own default.
  brandLine: "",
  phrase: DEFAULT_SPLASH_PHRASE,
  holdMs: Math.round(DEFAULT_SPLASH_HOLD_SECONDS * 1000),
  revisitAwayMs: DEFAULT_SPLASH_REVISIT_MINUTES * 60_000,
};

/**
 * Pages the greeting never covers. The patient's companion screen during a
 * guided video assessment is display only and dark: a splash dissolving over
 * it printed a ghost of the brand phrase behind the picture and the clock.
 */
export const SPLASH_SKIP_PATH = "/patient/dashboard/session";

export function splashSkipsPath(pathname: string): boolean {
  return pathname === SPLASH_SKIP_PATH || pathname.startsWith(`${SPLASH_SKIP_PATH}/`);
}

/**
 * Builds the script that runs in the document head, before the browser
 * paints anything.
 *
 * It has to be inline and blocking. Deciding this in a React effect means
 * the page paints first and the splash drops in on top of a site the
 * visitor can already see, which reads as a fault rather than a greeting.
 * Anyone who has asked for reduced motion is skipped outright: the splash
 * is pure decoration over content that is already there, so the honest
 * answer to "don't animate" is not to show it at all.
 *
 * Only the away threshold and the hold are interpolated, and both go through
 * Number() on the way in - the phrase is rendered by React as text and never reaches
 * this script, so nothing admin-typed is ever spliced into executable
 * source.
 */
export function splashBootScript(config: SplashConfig): string {
  const awayMs = Number.isFinite(config.revisitAwayMs)
    ? Math.max(0, Math.round(config.revisitAwayMs))
    : DEFAULT_SPLASH_CONFIG.revisitAwayMs;
  const holdMs = Number.isFinite(config.holdMs)
    ? Math.max(0, Math.round(config.holdMs))
    : DEFAULT_SPLASH_CONFIG.holdMs;
  return `(function(){try{
var m=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)");
if(m&&m.matches)return;
var p=location.pathname;
if(p===${JSON.stringify(SPLASH_SKIP_PATH)}||p.indexOf(${JSON.stringify(SPLASH_SKIP_PATH + "/")})===0)return;
var s=window.sessionStorage;
var away=${awayMs};
var greeted=s.getItem(${JSON.stringify(SPLASH_SHOWN_KEY)});
var hiddenAt=Number(s.getItem(${JSON.stringify(SPLASH_HIDDEN_AT_KEY)})||0);
var returning=away>0&&hiddenAt>0&&Date.now()-hiddenAt>=away;
if(!greeted||returning){
var cap=${Math.max(0, SPLASH_PUBLIC_TOTAL_MS - SPLASH_FADE_MS)};
var hold=${holdMs};
var uncapped=${JSON.stringify(SPLASH_UNCAPPED_PREFIXES)};
var capped=true;
for(var i=0;i<uncapped.length;i++){if(p===uncapped[i]||p.indexOf(uncapped[i]+"/")===0){capped=false;break;}}
if(capped&&hold>cap)hold=cap;
var st=document.documentElement.style;
st.setProperty(${JSON.stringify(SPLASH_HOLD_VAR)},hold+"ms");
st.setProperty(${JSON.stringify(SPLASH_FADE_VAR)},${SPLASH_FADE_MS}+"ms");
document.documentElement.setAttribute(${JSON.stringify(SPLASH_ATTR)},"on");}
}catch(e){}})();`;
}

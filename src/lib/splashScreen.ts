/**
 * The brand splash the site paints over itself on a cold open.
 *
 * Everything about it is defined here — the phrase, the timings, the
 * storage keys and the inline boot script — because three separate places
 * have to agree on those values and none of them can import from the
 * others at the moment they run: an inline <script> in the document head,
 * a stylesheet, and a React effect. A key spelled differently in any one
 * of them means the splash either never appears or appears on every
 * navigation, and neither failure throws.
 */

/** The line the splash exists to say. One claim, in a patient's words. */
export const SPLASH_PHRASE = "Movement Is Medicine";

/** How long the splash holds at full opacity before it starts leaving. */
export const SPLASH_HOLD_MS = 1400;

/**
 * How long the fade-out runs. Must match the transition duration in
 * globals.css — the timer is what removes the overlay from the flow, so a
 * shorter timer cuts the fade off mid-way and a longer one leaves a
 * transparent sheet swallowing clicks.
 */
export const SPLASH_FADE_MS = 550;

/**
 * How long a tab must have been in the background before coming back to it
 * counts as a fresh open and replays the splash.
 *
 * It is deliberately not "any time the tab regains focus". A patient
 * paying by UPI leaves this tab for their bank's app and comes back
 * mid-checkout; so does anyone copying an OTP or a referral code. Splashing
 * over a payment in progress is the one thing this must never do, and a
 * UPI round trip is minutes, not a quarter of an hour.
 */
export const SPLASH_REVISIT_AWAY_MS = 15 * 60 * 1000;

/** Marks that this tab has already been greeted, so a reload stays quiet. */
export const SPLASH_SHOWN_KEY = "dpp.splash.shown";

/** When this tab was last hidden, so a return can be measured against it. */
export const SPLASH_HIDDEN_AT_KEY = "dpp.splash.hiddenAt";

/**
 * The attribute on <html> that drives the whole thing. "on" is holding,
 * "leaving" is fading out, absent is gone. Kept in CSS rather than React
 * state so the markup the server sends and the markup React hydrates are
 * identical — the overlay is in the HTML from the first byte, and only
 * this attribute decides whether it is painted.
 */
export const SPLASH_ATTR = "data-splash";

/**
 * Runs in the document head, before the browser paints anything.
 *
 * It has to be inline and blocking. Deciding this in a React effect means
 * the page paints first and the splash drops in on top of a site the
 * visitor can already see, which reads as a fault rather than a greeting.
 * Anyone who has asked for reduced motion is skipped outright: the splash
 * is pure decoration over content that is already there, so the honest
 * answer to "don't animate" is not to show it at all.
 */
export const SPLASH_BOOT_SCRIPT = `(function(){try{
var m=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)");
if(m&&m.matches)return;
var s=window.sessionStorage;
var greeted=s.getItem(${JSON.stringify(SPLASH_SHOWN_KEY)});
var hiddenAt=Number(s.getItem(${JSON.stringify(SPLASH_HIDDEN_AT_KEY)})||0);
var returning=hiddenAt>0&&Date.now()-hiddenAt>=${SPLASH_REVISIT_AWAY_MS};
if(!greeted||returning){document.documentElement.setAttribute(${JSON.stringify(SPLASH_ATTR)},"on");}
}catch(e){}})();`;

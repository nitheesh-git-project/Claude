import type { Metadata } from "next";
import { Suspense } from "react";
import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import FarewellBanner from "@/components/FarewellBanner";
import Footer from "@/components/Footer";
import DebugNav from "@/components/DebugNav";
import ScrollHint from "@/components/ScrollHint";
import { SectionNavProvider } from "@/components/SectionNavContext";
import { getLayoutSettings } from "@/lib/siteSettingsCache";
import { devContactFromRow } from "@/lib/devReachout";
import { footerSocialLinks } from "@/lib/socialLinks";
import { DEFAULT_ADMIN_SETTINGS, parseAdminSettings } from "@/lib/adminSettings";
import { isDebugNavVisible } from "@/lib/debugNavVisible";
import SplashScreen from "@/components/system/SplashScreen";
import RouteProgress from "@/components/system/RouteProgress";
import FormValidationChrome from "@/components/system/FormValidationChrome";
import ErrorAutoScroll from "@/components/system/ErrorAutoScroll";
import LinkProgress from "@/components/system/LinkProgress";
import NumericInputGuard from "@/components/system/NumericInputGuard";
import ToastViewport from "@/components/system/ToastViewport";
import { ToastProvider } from "@/lib/toast";
import { PendingWorkProvider } from "@/lib/pendingWork";
import {
  DEFAULT_SPLASH_CONFIG,
  splashBootScript,
  type SplashConfig,
} from "@/lib/splashScreen";

// Inter for body copy - optimized for on-screen reading at small sizes,
// which matters here given how much clinical/pricing detail patients read.
// Plus Jakarta Sans for headings/display - geometric and confident without
// tipping into a cold "tech" register, which suits a healthcare brand.
//
// Both are self-hosted at build time by next/font/google - the font files
// are emitted into this app's own build output, so a page load makes no
// runtime request to Google. display: "swap" means text paints immediately
// in the fallback and swaps once the file lands, rather than flashing
// invisible.
//
// These expose the raw families only. --font-sans / --font-display (the
// full stacks, fallbacks included) are composed from them in globals.css:
// if next/font wrote those names directly, a stylesheet declaring its own
// --font-sans would silently shadow the self-hosted family and quietly send
// everyone back to a system font.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "MoveRestore",
  description:
    "Expert 1-on-1 virtual physical therapy for global patients. Evidence-based rehabilitation from licensed specialists, from the comfort of home.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // On in every environment while the app is pre-launch - see
  // debugNavVisible.ts for why, and for the one kill switch.
  const showDebugNav = isDebugNavVisible();

  // Brand & Contact Details (admin Site Content tab) -- the Navbar/Footer
  // used to hardcode these. Fetched here rather than in each component
  // since both need it and this is the one place they share: the root
  // layout. Public/anon client (no cookies()) so pages under this layout
  // can stay statically generated/ISR-cached; parseAdminSettings() already
  // degrades to the old hardcoded strings as defaults if the migration
  // adding these columns hasn't run yet.
  //
  // All five groups below are still five separate selects -- see
  // siteSettingsCache.ts for why a newer column must not be able to blank
  // the site name -- but they now run concurrently and the whole set is
  // cached under the `site-settings` tag. This layout wraps every page in
  // the app, so what used to be four serial Supabase round-trips before
  // first byte, on every single page load, is now usually none.
  const {
    brand: settingsRow,
    social: socialRow,
    homeVisit: homeVisitRow,
    farewell: farewellRow,
    splash: splashRow,
    devContact: devContactRow,
  } = await getLayoutSettings();
  // The developer credit under the footer's copyright. On unless an admin
  // switched it off -- and an unreadable row is "could not check", not "off".
  const devCreditEnabled = devContactFromRow(devContactRow).enabled;
  const brand = parseAdminSettings(settingsRow);
  // The footer's social icons -- only the networks the clinic has filled in,
  // and nothing at all on a database without the columns yet.
  const socialLinks = footerSocialLinks(socialRow);

  // Whether the Navbar shows its Home Visit link. Defaults to hidden when
  // the column doesn't exist yet, which is also the right answer for a
  // database that has never configured the feature.
  const homeVisitEnabled = homeVisitRow?.home_visit_enabled === true;

  // How long the post-logout banner stays up.
  const farewellBannerSeconds =
    typeof farewellRow?.farewell_banner_seconds === "number"
      ? farewellRow.farewell_banner_seconds
      : DEFAULT_ADMIN_SETTINGS.farewellBannerSeconds;

  // The opening splash's four settings. Falls back to the defaults in
  // splashScreen.ts, which is what a database that has never configured the
  // greeting should get.
  const splash: SplashConfig = {
    enabled: splashRow?.splash_enabled ?? DEFAULT_SPLASH_CONFIG.enabled,
    // Blank (the default) means "follow the site name", so the greeting and
    // the navbar say the same thing unless an admin deliberately parts them.
    brandLine:
      typeof splashRow?.splash_brand_line === "string" && splashRow.splash_brand_line.trim()
        ? splashRow.splash_brand_line.trim()
        : brand.siteName,
    phrase:
      typeof splashRow?.splash_phrase === "string" && splashRow.splash_phrase.trim()
        ? splashRow.splash_phrase.trim()
        : DEFAULT_SPLASH_CONFIG.phrase,
    holdMs:
      typeof splashRow?.splash_hold_seconds === "number"
        ? Math.round(splashRow.splash_hold_seconds * 1000)
        : DEFAULT_SPLASH_CONFIG.holdMs,
    revisitAwayMs:
      typeof splashRow?.splash_revisit_minutes === "number"
        ? splashRow.splash_revisit_minutes * 60_000
        : DEFAULT_SPLASH_CONFIG.revisitAwayMs,
  };

  return (
    // suppressHydrationWarning covers this one element's own attributes:
    // the splash boot script below writes data-splash onto <html> before
    // React hydrates, so the server's markup and the live DOM legitimately
    // differ by that attribute. It does not reach any descendant, so a real
    // mismatch anywhere inside the page still warns.
    <html
      lang="en"
      suppressHydrationWarning
      className={`h-full antialiased ${inter.variable} ${jakarta.variable}`}
    >
      <head>
        {/* Decides whether this load gets the brand splash, and does it
            before the browser paints. It has to be inline and blocking:
            an effect runs after first paint, so the greeting would drop
            on top of a site the visitor can already see. See
            src/lib/splashScreen.ts - the script, the CSS in globals.css
            and the component all read their keys and timings from there.
            Omitted entirely when an admin has switched the splash off, so
            nothing can set the attribute the CSS paints on. */}
        {splash.enabled && (
          <script dangerouslySetInnerHTML={{ __html: splashBootScript(splash) }} />
        )}
      </head>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-800 font-sans">
        {/* Always in the HTML, painted only when the script above says so -
            keeping the markup constant is what stops this being a
            hydration mismatch on every page. */}
        {splash.enabled && <SplashScreen config={splash} />}
        {/* Wraps everything, because the work being waited on outlives the
            control that started it: a button's own spinner is unmounted the
            moment its row is refreshed away, and a navigation has no button
            left at all. One counter at the root is the only place that can
            still be watching when the new HTML lands. */}
        <PendingWorkProvider>
          {/* Above every route, so a confirmation raised by a control
              survives the router.refresh() that control fires -- the tree
              underneath re-renders, this does not unmount. */}
          <ToastProvider>
          <RouteProgress />
          {/* Every link reports itself, not only the ones written through
              ProgressLink or useRouter. useSearchParams inside it makes this
              subtree opt into client rendering, hence the Suspense -- the
              pages under it stay statically rendered. */}
          <Suspense fallback={null}>
            <LinkProgress />
          </Suspense>
          <ToastViewport />
          {/* Replaces the browser's own grey validation bubble everywhere at
              once. One listener at the root rather than a change to every
              form, because `invalid` is fired by the browser on every
              control it refuses and no form has to opt in. */}
          <FormValidationChrome />
          {/* The same idea for errors the browser cannot see: a red banner that
              appears off-screen after a tap is scrolled into view. */}
          <ErrorAutoScroll />
          {/* A number box takes digits and nothing else. The browser's own
              type="number" also accepts e, E and +, and then reports the
              value as empty -- so one listener here rather than a rule each
              of the app's number boxes has to remember. */}
          <NumericInputGuard />
        {showDebugNav && <DebugNav />}
        <Navbar
          offsetTop={showDebugNav}
          siteName={brand.siteName}
          siteTagline={brand.siteTagline}
          homeVisitEnabled={homeVisitEnabled}
        />
        <Suspense fallback={null}>
          <FarewellBanner autoDismissSeconds={farewellBannerSeconds} />
        </Suspense>
        {/* Wraps the page and the scroll cue together: the page's section
            rail publishes its section list here, and the cue below reads it
            to know where the next section starts. */}
        <SectionNavProvider>
          <main className="flex-grow">{children}</main>
          <Footer
            siteName={brand.siteName}
            siteDescription={brand.siteDescription}
            contactEmail={brand.contactEmail}
            whatsappNumber={brand.whatsappNumber}
            contactPhone={brand.contactPhone}
            footerCopyrightText={brand.footerCopyrightText}
            socialLinks={socialLinks}
            homeVisitEnabled={homeVisitEnabled}
            devCreditEnabled={devCreditEnabled}
          />
          <ScrollHint />
        </SectionNavProvider>
          </ToastProvider>
        </PendingWorkProvider>
      </body>
    </html>
  );
}

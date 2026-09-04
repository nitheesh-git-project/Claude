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
import { createPublicClient } from "@/lib/supabase/public";
import { DEFAULT_ADMIN_SETTINGS, parseAdminSettings } from "@/lib/adminSettings";
import { isDebugNavVisible } from "@/lib/debugNavVisible";
import SplashScreen from "@/components/system/SplashScreen";
import RouteProgress from "@/components/system/RouteProgress";
import { PendingWorkProvider } from "@/lib/pendingWork";
import {
  DEFAULT_SPLASH_CONFIG,
  splashBootScript,
  type SplashConfig,
} from "@/lib/splashScreen";

// Inter for body copy — optimized for on-screen reading at small sizes,
// which matters here given how much clinical/pricing detail patients read.
// Plus Jakarta Sans for headings/display — geometric and confident without
// tipping into a cold "tech" register, which suits a healthcare brand.
//
// Both are self-hosted at build time by next/font/google — the font files
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
  title: "Dr. Pooja's Physio | Global Virtual Physical Therapy",
  description:
    "Expert 1-on-1 virtual physical therapy for global patients. Evidence-based rehabilitation from licensed specialists, from the comfort of home.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // On in every environment while the app is pre-launch — see
  // debugNavVisible.ts for why, and for the one kill switch.
  const showDebugNav = isDebugNavVisible();

  // Brand & Contact Details (admin Site Content tab) -- the Navbar/Footer
  // used to hardcode these. Fetched here rather than in each component
  // since both need it and this is the one place they share: the root
  // layout. Public/anon client (no cookies()) so pages under this layout
  // can stay statically generated/ISR-cached; parseAdminSettings() already
  // degrades to the old hardcoded strings as defaults if the migration
  // adding these columns hasn't run yet.
  const supabase = createPublicClient();
  const { data: settingsRow } = await supabase
    .from("site_settings")
    .select(
      "site_name, site_tagline, site_description, contact_email, whatsapp_number, contact_phone, footer_copyright_text"
    )
    .maybeSingle();
  const brand = parseAdminSettings(settingsRow);

  // Whether the Navbar shows its Home Visit link. Its own isolated query,
  // not folded into the brand select above: home_visit_enabled is a newer
  // column, and an unknown-column error here would otherwise blank the
  // site name and tagline on every page as collateral. Defaults to hidden
  // when the column doesn't exist yet, which is also the right answer for
  // a database that has never configured the feature.
  const { data: homeVisitRow } = await supabase
    .from("site_settings")
    .select("home_visit_enabled")
    .maybeSingle();
  const homeVisitEnabled = homeVisitRow?.home_visit_enabled === true;

  // How long the post-logout banner stays up. Its own isolated select for
  // the same reason as the one above: a newer column that a database which
  // hasn't re-run schema.sql does not have yet, and an unknown-column error
  // must not take the site name and tagline down with it.
  const { data: farewellRow } = await supabase
    .from("site_settings")
    .select("farewell_banner_seconds")
    .maybeSingle();
  const farewellBannerSeconds =
    typeof farewellRow?.farewell_banner_seconds === "number"
      ? farewellRow.farewell_banner_seconds
      : DEFAULT_ADMIN_SETTINGS.farewellBannerSeconds;

  // The opening splash's four settings, in their own isolated select for
  // the same migration-tolerance reason as the two above: these columns are
  // the newest in the table, and an unknown-column error here must not take
  // the site name and tagline down with it. Falls back to the defaults in
  // splashScreen.ts, which is what a database that has never configured the
  // greeting should get.
  const { data: splashRow } = await supabase
    .from("site_settings")
    .select(
      "splash_enabled, splash_brand_line, splash_phrase, splash_hold_seconds, splash_revisit_minutes"
    )
    .maybeSingle();
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
            src/lib/splashScreen.ts — the script, the CSS in globals.css
            and the component all read their keys and timings from there.
            Omitted entirely when an admin has switched the splash off, so
            nothing can set the attribute the CSS paints on. */}
        {splash.enabled && (
          <script dangerouslySetInnerHTML={{ __html: splashBootScript(splash) }} />
        )}
      </head>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-800 font-sans">
        {/* Always in the HTML, painted only when the script above says so —
            keeping the markup constant is what stops this being a
            hydration mismatch on every page. */}
        {splash.enabled && <SplashScreen config={splash} />}
        {/* Wraps everything, because the work being waited on outlives the
            control that started it: a button's own spinner is unmounted the
            moment its row is refreshed away, and a navigation has no button
            left at all. One counter at the root is the only place that can
            still be watching when the new HTML lands. */}
        <PendingWorkProvider>
          <RouteProgress />
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
            homeVisitEnabled={homeVisitEnabled}
          />
          <ScrollHint />
        </SectionNavProvider>
        </PendingWorkProvider>
      </body>
    </html>
  );
}

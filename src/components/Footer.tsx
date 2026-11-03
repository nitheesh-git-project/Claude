"use client";

import CountryPicker from "@/components/pricing/CountryPicker";
import { usePricing } from "@/components/pricing/PricingProvider";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isDashboardShellRoute, isDeveloperRoute } from "@/lib/dashboardShellRoutes";
import { BOOK_CONNECTOR, visibleMarketingPages } from "@/lib/marketingNav";
import { digitsOnly, hasRealEmail, hasRealPhone } from "@/lib/contactLinks";
import BrandMark from "@/components/BrandMark";
import type { ReactNode } from "react";
import {
  FacebookGlyph,
  InstagramGlyph,
  LinkedInGlyph,
  WhatsAppGlyph,
  YouTubeGlyph,
} from "@/components/visuals/BrandGlyphs";
import type { FooterSocialLink, SocialPlatform } from "@/lib/socialLinks";

const SOCIAL_GLYPHS: Record<SocialPlatform, () => ReactNode> = {
  instagram: () => <InstagramGlyph />,
  facebook: () => <FacebookGlyph />,
  linkedin: () => <LinkedInGlyph />,
  youtube: () => <YouTubeGlyph />,
  whatsapp: () => <WhatsAppGlyph />,
};

/** A footer row: a full 44px tall target, not an inline word. */
const FOOTER_LINK = "flex min-h-11 items-center hover:text-teal-400 transition";

export default function Footer({
  siteName,
  siteDescription,
  contactEmail,
  whatsappNumber,
  contactPhone,
  footerCopyrightText,
  socialLinks = [],
  homeVisitEnabled: homeVisitSwitch = false,
  devCreditEnabled = true,
  teamVisible = true,
}: {
  siteName: string;
  siteDescription: string;
  contactEmail: string;
  whatsappNumber: string;
  contactPhone: string;
  footerCopyrightText: string;
  /** Only the networks an admin has filled in -- see src/lib/socialLinks.ts.
   *  Empty means the row is not drawn at all. */
  socialLinks?: FooterSocialLink[];
  homeVisitEnabled?: boolean;
  /** Whether the developer credit line shows. Off when an admin switches the
   *  /developer pages off, so the line never links to a page that 404s. */
  devCreditEnabled?: boolean;
  /** Someone is published on /team. */
  teamVisible?: boolean;
}) {
  // Off outside India unless an admin allows it (Countries & currency).
  const { homeVisitsOffered } = usePricing();
  const homeVisitEnabled = homeVisitSwitch && homeVisitsOffered;
  const pathname = usePathname();
  // Same list the header and the connector grids read, minus Home (the
  // wordmark above already links there). Hardcoding these was how the footer
  // ended up offering four of the seven pages under labels the rest of the
  // site had stopped using.
  const links = visibleMarketingPages(homeVisitEnabled, teamVisible).filter(
    (page) => page.key !== "home"
  );
  // See Navbar's matching check -- each role dashboard is its own
  // full-height app shell with no page scroll, so a footer below it
  // would never be reachable/visible anyway.
  if (isDashboardShellRoute(pathname)) {
    return null;
  }
  // The developer pages stand alone -- see isDeveloperRoute.
  if (isDeveloperRoute(pathname)) {
    return null;
  }

  return (
    <footer className="bg-slate-900 text-slate-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid sm:grid-cols-2 md:grid-cols-4 gap-8">
        <div>
          <div className="flex items-center space-x-3 mb-3">
            <BrandMark size={36} />
            <span className="font-display text-white font-bold">{siteName}</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">{siteDescription}</p>
          {socialLinks.length > 0 && (
            // Under the clinic's name rather than in Contact: these are
            // where the practice is, not ways to reach it about a booking.
            // A new tab, because each leaves this site for someone else's
            // app -- a patient half-way through reading should not lose
            // their place. 44px, like every other footer link: a 36px
            // circle cleared WCAG's 24px minimum but not this footer's rule.
            <ul className="mt-4 flex flex-wrap gap-2" aria-label={`${siteName} on social media`}>
              {socialLinks.map((link) => (
                <li key={link.platform}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${link.label} (opens in a new tab)`}
                    title={link.label}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-800 text-base text-slate-300 transition hover:bg-teal-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
                  >
                    {SOCIAL_GLYPHS[link.platform]()}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          {/* Every link below is a 44px-tall row (FOOTER_LINK): at 12px type
              with py-1 they were 24px, a mis-tap waiting between two others
              on a phone. */}
          <h4 className="text-white text-sm font-semibold mb-2">Explore</h4>
          <ul className="text-sm">
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={FOOTER_LINK}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-white text-sm font-semibold mb-2">Book</h4>
          <ul className="text-sm">
            <li>
              <Link href={BOOK_CONNECTOR.href} className={FOOTER_LINK}>
                {BOOK_CONNECTOR.label}
              </Link>
            </li>
            {homeVisitEnabled && (
              <li>
                <Link href="/book-home-visit" className={FOOTER_LINK}>
                  Book a home visit
                </Link>
              </li>
            )}
          </ul>
          {/* The /get-started hub's other doors -- the therapist and partner
              sign-ins -- live here rather than in the header: a patient
              opening the menu should meet one primary button, and clinicians
              know where their own entrance is. */}
          <h4 className="text-white text-sm font-semibold mb-2 mt-5">For clinicians and partners</h4>
          <ul className="text-sm">
            <li>
              <Link href="/therapist/login" className={FOOTER_LINK}>
                Therapist sign in or apply
              </Link>
            </li>
            <li>
              <Link href="/hospital/login" className={FOOTER_LINK}>
                Hospital partner sign in
              </Link>
            </li>
            <li>
              <Link href="/get-started" className={FOOTER_LINK}>
                All sign-in options
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="text-white text-sm font-semibold mb-2">Contact</h4>
          <ul className="text-sm text-slate-400">
            <ContactLine
              icon={<i aria-hidden="true" className="fa-solid fa-envelope" />}
              value={contactEmail}
              href={`mailto:${contactEmail}`}
              show={hasRealEmail(contactEmail)}
            />
            <ContactLine
              icon={<WhatsAppGlyph />}
              value={whatsappNumber}
              href={`https://wa.me/${digitsOnly(whatsappNumber)}`}
              label="Chat on WhatsApp (opens in a new tab)"
              newTab
              show={hasRealPhone(whatsappNumber)}
            />
            <ContactLine
              icon={<i aria-hidden="true" className="fa-solid fa-phone" />}
              value={contactPhone}
              href={`tel:${digitsOnly(contactPhone, true)}`}
              show={hasRealPhone(contactPhone)}
            />
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-800 py-4 text-center text-[11px] text-slate-400">
        <p>
          {/* The year is the reader's, and the cached HTML's can be last
              year's (ISR) or UTC's (the server) on New Year's morning in
              India -- deliberately client-specific, so this one node only. */}
          © <span suppressHydrationWarning>{new Date().getFullYear()}</span> {footerCopyrightText}
        </p>
        <CountryPicker />
        {devCreditEnabled && (
          <p className="mt-1 px-4">
            Researched, designed and hand-built to make care easier for patients and therapists — by{" "}
            <span className="font-semibold text-slate-300">Nitheesh M</span> ·{" "}
            {/* 44px tall on a phone, the same as the footer's other links. */}
            <Link
              href="/developer"
              className="inline-flex min-h-11 items-center font-semibold text-slate-300 underline-offset-2 hover:text-teal-400 hover:underline transition"
            >
              Contact me
            </Link>
          </p>
        )}
      </div>
    </footer>
  );
}

function ContactLine({
  icon,
  value,
  href,
  label,
  newTab = false,
  show,
}: {
  icon: ReactNode;
  value: string;
  href: string;
  label?: string;
  /** For a link that leaves the site (WhatsApp). It used to replace this
   *  page with wa.me, so a patient who came back had lost their place.
   *  Email and phone stay as they are -- those hand off to an app, not a
   *  page. */
  newTab?: boolean;
  /** Whether this detail has actually been filled in -- see above. */
  show: boolean;
}) {
  if (!show) return null;
  return (
    <li>
      {/* A phone number a patient cannot tap is a phone number they have to
          copy out by hand, on the device most likely to be used to ring it. */}
      <a
        href={href}
        aria-label={label}
        {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        // A real address is longer than a footer column at the md
        // breakpoint (~164px at 800px wide): unbroken, it pushed the whole
        // page 10px wider than the screen (layout-audit, 800x480).
        className={`${FOOTER_LINK} min-w-0 [overflow-wrap:anywhere]`}
      >
        {/* The glyph is a node rather than a class string: the WhatsApp one
            is now inline SVG (see BrandGlyphs.tsx), which saved pulling the
            113 KB fa-brands webfont into every page for this single icon.
            The shared colour and spacing stay here so all three lines still
            match. */}
        <span className="text-teal-500 mr-2 inline-block">{icon}</span>
        {value}
      </a>
    </li>
  );
}

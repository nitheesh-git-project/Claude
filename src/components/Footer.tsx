"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isDashboardShellRoute } from "@/lib/dashboardShellRoutes";
import { MARKETING_PAGES } from "@/lib/marketingNav";
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

export default function Footer({
  siteName,
  siteDescription,
  contactEmail,
  whatsappNumber,
  contactPhone,
  footerCopyrightText,
  socialLinks = [],
  homeVisitEnabled = false,
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
}) {
  const pathname = usePathname();
  // Same list the header and the connector grids read, minus Home (the
  // wordmark above already links there). Hardcoding these was how the footer
  // ended up offering four of the seven pages under labels the rest of the
  // site had stopped using.
  const links = MARKETING_PAGES.filter(
    (page) => page.key !== "home" && (homeVisitEnabled || !page.requiresHomeVisit)
  );
  // See Navbar's matching check -- each role dashboard is its own
  // full-height dark app shell with no page scroll, so a footer below it
  // would never be reachable/visible anyway.
  if (isDashboardShellRoute(pathname)) {
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
            // their place. 36px targets clear WCAG 2.2's 24px minimum.
            <ul className="mt-4 flex flex-wrap gap-2" aria-label={`${siteName} on social media`}>
              {socialLinks.map((link) => (
                <li key={link.platform}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${link.label} (opens in a new tab)`}
                    title={link.label}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-base text-slate-300 transition hover:bg-teal-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
                  >
                    {SOCIAL_GLYPHS[link.platform]()}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          {/* The links below carry py-1 so each one clears WCAG 2.2's 24px
              minimum target on a phone. At 12px type they were 15px tall --
              the inline-link exception does not cover a navigation list, and
              a 15px target between two others is a mis-tap. */}
          <h4 className="text-white text-sm font-semibold mb-3">Explore</h4>
          <ul className="space-y-2 text-xs">
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="inline-block py-1 hover:text-teal-400 transition">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-white text-sm font-semibold mb-3">Get Started</h4>
          <ul className="space-y-2 text-xs">
            <li><Link href="/get-started" className="inline-block py-1 hover:text-teal-400 transition">Book a Consultation</Link></li>
            <li><Link href="/book" className="inline-block py-1 hover:text-teal-400 transition">Booking Enquiry</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="text-white text-sm font-semibold mb-3">Contact</h4>
          <ul className="space-y-2 text-xs text-slate-400">
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
        © {new Date().getFullYear()} {footerCopyrightText}
      </div>
    </footer>
  );
}

/**
 * `site_settings` ships both numbers as the literal string "+91 XXXXX XXXXX"
 * -- a placeholder for an admin to replace, which the footer printed as
 * though it were the clinic's number. On the one page a hesitant patient
 * looks for evidence there is a real practice behind this, the answer was a
 * row of X's. Nothing is better than a fake: the same reading `refundState`
 * already applies, where "none" renders nothing rather than an empty chip.
 *
 * Counted rather than matched against the placeholder string, which would go
 * stale the moment somebody edited it to "+91 XXXXXXXXXX". An Indian mobile
 * with its country code is twelve digits; the shipped placeholder has two.
 * Seven is comfortably below any real number and far above any placeholder.
 */
const MIN_REAL_PHONE_DIGITS = 7;

function hasRealPhone(value: string): boolean {
  return (value ?? "").replace(/[^0-9]/g, "").length >= MIN_REAL_PHONE_DIGITS;
}

function hasRealEmail(value: string): boolean {
  return /.+@.+\..+/.test(value ?? "");
}

/** wa.me takes digits with the country code and no punctuation. */
function digitsOnly(value: string, keepPlus = false): string {
  const digits = (value ?? "").replace(/[^0-9]/g, "");
  return keepPlus && value?.trim().startsWith("+") ? `+${digits}` : digits;
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
        className="inline-block py-1 hover:text-teal-400 transition"
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

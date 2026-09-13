"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isDashboardShellRoute } from "@/lib/dashboardShellRoutes";
import { MARKETING_PAGES } from "@/lib/marketingNav";

export default function Footer({
  siteName,
  siteDescription,
  contactEmail,
  whatsappNumber,
  contactPhone,
  footerCopyrightText,
  homeVisitEnabled = false,
}: {
  siteName: string;
  siteDescription: string;
  contactEmail: string;
  whatsappNumber: string;
  contactPhone: string;
  footerCopyrightText: string;
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
            <div className="w-9 h-9 rounded-xl bg-teal-700 text-white flex items-center justify-center font-bold shadow-md">
              <i className="fa-solid fa-user-doctor"></i>
            </div>
            <span className="font-display text-white font-bold">{siteName}</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">{siteDescription}</p>
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
              icon="fa-solid fa-envelope"
              value={contactEmail}
              href={`mailto:${contactEmail}`}
              show={hasRealEmail(contactEmail)}
            />
            <ContactLine
              icon="fa-brands fa-whatsapp"
              value={whatsappNumber}
              href={`https://wa.me/${digitsOnly(whatsappNumber)}`}
              label="Chat on WhatsApp"
              show={hasRealPhone(whatsappNumber)}
            />
            <ContactLine
              icon="fa-solid fa-phone"
              value={contactPhone}
              href={`tel:${digitsOnly(contactPhone, true)}`}
              show={hasRealPhone(contactPhone)}
            />
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-800 py-4 text-center text-[11px] text-slate-500">
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
  show,
}: {
  icon: string;
  value: string;
  href: string;
  label?: string;
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
        className="inline-block py-1 hover:text-teal-400 transition"
      >
        <i aria-hidden="true" className={`${icon} text-teal-500 mr-2`}></i>
        {value}
      </a>
    </li>
  );
}

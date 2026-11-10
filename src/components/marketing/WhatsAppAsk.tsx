import { WhatsAppGlyph } from "@/components/visuals/BrandGlyphs";

/**
 * "Not sure which to book? WhatsApp us" -- the way out for the visitor who
 * cannot choose between a video session and a home visit and would rather ask
 * a person than a form. One component for the home hero and every closing
 * band so the line reads the same wherever it appears.
 *
 * The caller passes the link only when the clinic has a real WhatsApp number
 * (src/lib/contactLinks.ts); with `href` null this renders nothing, so an
 * unset number can never become a dead link.
 */
export default function WhatsAppAsk({
  href,
  tone = "light",
  className = "",
}: {
  href: string | null;
  /** `dark` for the teal closing band, `light` for the white hero. */
  tone?: "light" | "dark";
  className?: string;
}) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Not sure which to book? WhatsApp us (opens in a new tab)"
      className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-1 text-base font-semibold underline underline-offset-4 transition ${
        tone === "dark"
          ? "text-teal-50 decoration-teal-300/60 hover:text-white"
          : "text-emerald-800 decoration-emerald-400/70 hover:text-emerald-950"
      } ${className}`}
    >
      <WhatsAppGlyph />
      Not sure which to book? WhatsApp us
    </a>
  );
}

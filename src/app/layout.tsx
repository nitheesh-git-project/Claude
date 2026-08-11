import type { Metadata } from "next";
import { Suspense } from "react";
import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import FarewellBanner from "@/components/FarewellBanner";
import Footer from "@/components/Footer";
import DebugNav from "@/components/DebugNav";
import ScrollHint from "@/components/ScrollHint";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Defaults to hidden on any production build (next build/start sets
  // NODE_ENV=production automatically — no env var to remember), visible
  // during local dev for convenience. NEXT_PUBLIC_SHOW_DEBUG_NAV overrides
  // either way if a real need for it in a specific environment comes up.
  const showDebugNav =
    process.env.NEXT_PUBLIC_SHOW_DEBUG_NAV === "true" ||
    (process.env.NEXT_PUBLIC_SHOW_DEBUG_NAV !== "false" &&
      process.env.NODE_ENV !== "production");

  return (
    <html lang="en" className={`h-full antialiased ${inter.variable} ${jakarta.variable}`}>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-800 font-sans">
        {showDebugNav && <DebugNav />}
        <Navbar offsetTop={showDebugNav} />
        <Suspense fallback={null}>
          <FarewellBanner />
        </Suspense>
        <main className="flex-grow">{children}</main>
        <Footer />
        <ScrollHint />
      </body>
    </html>
  );
}

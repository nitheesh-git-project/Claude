import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import Navbar from "@/components/Navbar";
import FarewellBanner from "@/components/FarewellBanner";
import Footer from "@/components/Footer";
import DebugNav from "@/components/DebugNav";

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
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-800 font-sans">
        {showDebugNav && <DebugNav />}
        <Navbar offsetTop={showDebugNav} />
        <Suspense fallback={null}>
          <FarewellBanner />
        </Suspense>
        <main className="flex-grow">{children}</main>
        <Footer />
      </body>
    </html>
  );
}

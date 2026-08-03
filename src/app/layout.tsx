import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
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
  const showDebugNav = process.env.NEXT_PUBLIC_SHOW_DEBUG_NAV !== "false";

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-800 font-sans">
        {showDebugNav && <DebugNav />}
        <Navbar offsetTop={showDebugNav} />
        <main className="flex-grow">{children}</main>
        <Footer />
      </body>
    </html>
  );
}

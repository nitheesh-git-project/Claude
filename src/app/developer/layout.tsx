import Link from "next/link";

// Both developer pages share this shell so each carries exactly one way out:
// a "Back to home" button at the bottom right. The Navbar, Footer and debug
// bar are hidden on these routes (see isDeveloperRoute), so nothing else on
// the screen leads anywhere.
export default function DeveloperLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center pb-20">
      {children}
      <Link
        href="/"
        className="fixed bottom-5 right-5 sm:bottom-7 sm:right-7 z-30 inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
      >
        <i className="fa-solid fa-house" aria-hidden="true" />
        Back to home
      </Link>
    </div>
  );
}

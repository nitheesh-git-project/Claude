import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import SayHelloArt from "@/components/developer/SayHelloArt";
import { getDevContact } from "@/lib/siteSettingsCache";

export const metadata: Metadata = {
  title: "Say hello | MoveRestore",
  description: "Have an idea, a question, or feedback on this app? Say hello to its developer.",
};

// Rendered per request, and for the reason /book-home-visit is: the page's
// existence is a switch (Settings -> Dev Reachouts). Under ISR the 404 would
// be decided when the page was generated, so a switch changed any way other
// than the admin's own save would leave the door open until the window lapsed.
//
// This page is deliberately NOT one of the public marketing pages: it is not
// in MARKETING_PAGES, so no navbar link, Explore card or "where next" band
// advertises it. The only door is the credit line under the footer.
export const dynamic = "force-dynamic";

export default async function DeveloperPage() {
  const { enabled } = await getDevContact();
  if (!enabled) notFound();

  return (
    <div className="bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm grid md:grid-cols-2 gap-8 md:gap-12 items-center p-8 sm:p-12">
          <SayHelloArt className="w-full max-w-xs mx-auto" />
          <div>
            <h1 className="font-display text-4xl sm:text-5xl font-bold text-slate-900">
              Say hello!
            </h1>
            <p className="mt-4 text-slate-600 leading-relaxed">
              Have an idea, a question, or feedback on this app? I&apos;d love to hear it.
            </p>
            <Link
              href="/developer/lets-talk"
              className="mt-8 inline-flex items-center rounded-full border-2 border-slate-800 px-7 py-3 text-sm font-bold text-slate-900 transition hover:bg-slate-900 hover:text-white"
            >
              Say hey!
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

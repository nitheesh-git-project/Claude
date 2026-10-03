import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DevReachoutForm from "@/components/developer/DevReachoutForm";
import { getDevContact } from "@/lib/siteSettingsCache";

export const metadata: Metadata = {
  title: "Let's talk | MoveRestore",
  description: "Send a message to the developer of this app.",
};

// Per request, for the reason /developer is. See the note there.
export const dynamic = "force-dynamic";

export default async function LetsTalkPage() {
  const { enabled, email } = await getDevContact();
  if (!enabled) notFound();

  return (
    <div className="bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm grid md:grid-cols-2 overflow-hidden">
          <div className="p-8 sm:p-12 flex flex-col">
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-slate-900 leading-tight">
              {"Let's build something that helps people move."}
            </h1>
            <p className="mt-4 text-slate-600 leading-relaxed">
              Tell me what you noticed, what you wish it did, or just say hi.
            </p>
            {/* Hidden while no address is set: nothing is committed to the
                repo, so the owner types the one to publish in Settings -> Dev
                Reachouts, and until then the form is the only way in. */}
            {email && (
              <p className="mt-auto pt-10 text-sm text-slate-600">
                Prefer email?{" "}
                <a
                  href={`mailto:${email}`}
                  className="font-semibold text-teal-700 underline underline-offset-2 hover:text-teal-800 break-all"
                >
                  {email}
                </a>
              </p>
            )}
          </div>
          <div className="bg-slate-50 p-8 sm:p-12 md:border-l border-t md:border-t-0 border-slate-200">
            <DevReachoutForm />
          </div>
        </div>
      </div>
    </div>
  );
}

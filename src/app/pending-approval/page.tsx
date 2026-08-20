import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { SUPPORT_EMAIL } from "@/lib/siteContact";

export const metadata: Metadata = {
  title: "Approval Pending | Dr. Pooja's Physio",
};

// Both self-serve roles land here now — a therapist waiting on their
// application review, and a patient waiting on their new account being
// approved. The wording is the only difference, so this reads the role
// rather than duplicating the whole screen per role. A signed-out visitor
// (someone who signed out and came back to the link, say) gets the neutral
// copy.
export default async function PendingApprovalPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let role: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    role = profile?.role ?? null;
  }

  const heading = role === "therapist" ? "Application Received" : "Approval Pending";
  const body =
    role === "therapist"
      ? "Thanks for applying to join the therapist network. Your credentials are being reviewed — you'll get access to your dashboard once an admin approves your account."
      : role === "patient"
        ? "Thanks for registering. Your account is being reviewed — you'll get access to your dashboard, and be able to book sessions, once an admin approves it."
        : "Your account is being reviewed. You'll get access to your dashboard once an admin approves it.";

  return (
    <section className="py-16 max-w-lg mx-auto px-4 text-center">
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-lg">
        <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center text-2xl mx-auto mb-4">
          <i className="fa-solid fa-clock"></i>
        </div>
        <h1 className="text-xl font-bold text-slate-900">{heading}</h1>
        <p className="text-xs text-slate-500 mt-2 leading-relaxed">{body}</p>
        <p className="text-xs text-slate-500 mt-3 leading-relaxed">
          Questions, or it&apos;s been a while? Reach out at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-teal-700 font-semibold hover:underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
        <Link
          href="/"
          className="mt-6 inline-block w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 px-4 rounded-xl text-xs transition shadow"
        >
          Back to Home
        </Link>
      </div>
    </section>
  );
}

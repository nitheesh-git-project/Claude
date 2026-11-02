import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Your screen | MoveRestore",
  robots: { index: false, follow: false },
};

// The short link a patient types (or scans) on a laptop, tablet or TV to open
// the second screen for a guided check: it lands on the companion screen, and
// the dashboard's own sign-in guard asks for the patient's account there as it
// does for any other patient page. Nothing is read or decided here.
export default function ScreenShortLink() {
  redirect("/patient/dashboard/session");
}

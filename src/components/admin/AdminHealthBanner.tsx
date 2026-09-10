import Link from "next/link";
import { adminScreenHref } from "@/lib/adminNav";
import { healthBannerText, type HealthCheck } from "@/lib/systemHealth";

// The one line Today carries when a System Health check is red.
//
// Settings -> System Health is opened by somebody who already suspects
// trouble, which is the wrong order for the two failures that are silent by
// nature: a missing Razorpay webhook secret leaves money arriving against
// bookings that stay unpaid, and a dead Google credential gives every new
// session no video link. Both can run for weeks with nothing on any screen
// an admin actually visits daily.
//
// Red only. Amber is "look at this today" and belongs on the screen that
// owns it -- a banner that is usually there is a banner nobody reads, which
// is the same reasoning behind the recommendation queue's staleness badge.
export default function AdminHealthBanner({ checks }: { checks: HealthCheck[] }) {
  const banner = healthBannerText(checks);
  if (!banner) return null;

  return (
    <Link
      href={adminScreenHref("settings", "health")}
      className="flex items-start gap-3 rounded-2xl border border-red-300 bg-red-50 p-4 shadow-sm transition hover:border-red-400 sm:p-5"
    >
      <i
        aria-hidden
        className="fa-solid fa-circle-exclamation mt-0.5 text-lg text-red-600"
      />
      <span className="min-w-0 flex-1">
        <span className="block font-display text-sm font-bold text-red-900">
          {banner.title}
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-red-800">
          {banner.detail}
        </span>
        <span className="mt-1.5 block text-[11px] font-semibold text-red-700">
          Open System Health to fix it →
        </span>
      </span>
    </Link>
  );
}

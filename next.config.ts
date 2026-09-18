import type { NextConfig } from "next";

// Sent on every response. None of these existed, which for an app holding
// clinical records and running a payment flow meant the admin dashboard and
// the patient's health profile were both framable by any site.
//
// CSP is deliberately absent from this list and shipped report-only below:
// Razorpay's checkout injects its own script and iframe, the splash boot
// script in the document head is inline by necessity (see
// src/lib/splashScreen.ts -- it has to run before first paint), and Next
// itself inlines hydration data. Enforcing a policy written blind would
// take down checkout. Collect reports first, then promote the header.
const SECURITY_HEADERS = [
  // Nothing in this app is meant to be embedded anywhere.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // A referral token and an appointment id both travel in URLs here, so a
  // full referrer to a third party would leak them.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Report-only: this is the policy we intend to enforce, and until the
  // reports come back clean it must not be the one that breaks a payment.
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co https://*.razorpay.com",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.razorpay.com https://lumberjack.razorpay.com",
      "frame-src https://*.razorpay.com https://api.razorpay.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  images: {
    // Avatars and catalog covers live in Supabase Storage's public buckets.
    // Wildcarded rather than pinned to one project ref so this keeps working
    // across dev/staging/prod Supabase projects without editing config per
    // env -- the cost is that any Supabase project can be proxied through
    // this optimizer, which is worth pinning once the project refs settle.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;

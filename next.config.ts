import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Avatars live in Supabase Storage's public bucket -- wildcarded
    // rather than pinned to one project ref so this keeps working across
    // dev/staging/prod Supabase projects without editing config per env.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;

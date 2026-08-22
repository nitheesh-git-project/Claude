"use client";

import RouteError from "@/components/system/RouteError";

export default function Error(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError {...props} homeHref="/admin/dashboard" homeLabel="Back to the dashboard" />;
}

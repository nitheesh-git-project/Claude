"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";

export default function RequestConditionAccessButton({ patientId }: { patientId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleRequest() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/therapist/condition-access/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not request access. Please try again.");
      }
    });
  }

  return (
    <div>
      <button
        onClick={handleRequest}
        disabled={isPending}
        className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition"
      >
        {isPending ? "Requesting..." : "Request access to edit"}
      </button>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}

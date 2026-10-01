"use client";

import ResetSignInButton from "@/components/admin/ResetSignInButton";

// Issues a one-time sign-in link for this therapist -- see ResetSignInButton.
// It used to generate a password and keep it on screen (and stored) until
// they set their own; nothing plaintext is kept now.
export default function ResetTherapistPasswordButton({ therapistId }: { therapistId: string }) {
  return (
    <ResetSignInButton
      endpoint="/api/admin/reset-therapist-password"
      body={{ therapistId }}
      noun="therapist"
    />
  );
}

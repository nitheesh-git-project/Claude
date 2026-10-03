"use client";

import ResetSignInButton from "@/components/admin/ResetSignInButton";

// Issues a one-time sign-in link for this partner -- see ResetSignInButton.
// It used to generate a password and keep it on screen (and stored) until
// they set their own; nothing plaintext is kept now.
export default function ResetHospitalPasswordButton({ hospitalId }: { hospitalId: string }) {
  return (
    <ResetSignInButton
      endpoint="/api/admin/reset-hospital-password"
      body={{ hospitalId }}
      noun="partner"
    />
  );
}

export type ReferralCodeCheck =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "valid"; hospitalName: string | null }
  | { status: "invalid" };

export async function checkReferralCode(code: string): Promise<ReferralCodeCheck> {
  const trimmed = code.trim();
  if (!trimmed) return { status: "idle" };

  try {
    const res = await fetch(
      `/api/patient/check-referral-code?code=${encodeURIComponent(trimmed)}`
    );
    const data = await res.json();
    if (!res.ok || !data.valid) return { status: "invalid" };
    return { status: "valid", hospitalName: data.hospitalName ?? null };
  } catch {
    return { status: "idle" };
  }
}

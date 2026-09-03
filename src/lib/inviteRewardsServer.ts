// Server-side invite work: giving a patient their code, claiming somebody
// else's, spending a half on a booking and settling it once that booking is
// paid for.
//
// Every write here goes through a security-definer function in schema.sql
// rather than a table write, because each one gives money away and none of
// them may be driven from a browser. What is left in TypeScript is the part
// with a price in it, which is the part that belongs in a tested module.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateInviteCode,
  normalizeInviteCode,
  type InviteRejection,
} from "@/lib/inviteRewards";
import type { DiscountSource } from "@/lib/discounts";

type AdminClient = SupabaseClient;

/**
 * A patient's own invite code, minted on first use.
 *
 * Called from the patient dashboard's own loader, so it runs on a render
 * rather than on a schedule -- the same lazy pattern the expiry sweeps use,
 * for the same reason: there is no worker in this deployment to mint them
 * in advance.
 *
 * A collision hands back null and this tries again. Three attempts over an
 * alphabet of 32 to the eighth is not a real loop; it is there so a code
 * that happens to be taken costs a retry rather than the render.
 */
export async function ensureInviteCode(
  admin: AdminClient,
  profileId: string
): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const bytes = new Uint8Array(8);
    globalThis.crypto.getRandomValues(bytes);
    try {
      const { data, error } = await admin.rpc("ensure_invite_code", {
        p_profile_id: profileId,
        p_candidate: generateInviteCode(bytes),
      });
      if (error) return null;
      if (typeof data === "string" && data.length > 0) return data;
    } catch {
      return null;
    }
  }
  return null;
}

export type InviteClaimOutcome =
  | { ok: true; welcomePaise: number; rewardPaise: number }
  | { ok: false; reason: InviteRejection | "error"; message: string };

const CLAIM_MESSAGES: Record<string, string> = {
  disabled: "Invites aren't running at the moment.",
  unknown_code: "That invite code isn't recognised.",
  self: "That's your own invite code.",
  already_claimed: "You've already used an invite code.",
  not_new: "An invite code can only be used before your first session.",
  inviter_capped: "That invite code can't be used at the moment.",
};

/** Claiming a friend's code. Every rule is enforced inside the function. */
export async function claimInvite(
  admin: AdminClient,
  code: string,
  inviteeId: string
): Promise<InviteClaimOutcome> {
  try {
    const { data, error } = await admin.rpc("claim_invite", {
      p_code: normalizeInviteCode(code),
      p_invitee_id: inviteeId,
    });
    if (error) {
      console.error("claim_invite failed", error.message);
      return { ok: false, reason: "error", message: "That code couldn't be applied." };
    }
    const result = (data ?? {}) as Record<string, unknown>;
    if (result.ok === true) {
      return {
        ok: true,
        welcomePaise: Number(result.welcome_paise ?? 0),
        rewardPaise: Number(result.reward_paise ?? 0),
      };
    }
    const reason = typeof result.reason === "string" ? result.reason : "error";
    return {
      ok: false,
      reason: reason as InviteRejection | "error",
      message: CLAIM_MESSAGES[reason] ?? "That code couldn't be applied.",
    };
  } catch (err) {
    console.error("claim_invite threw", err);
    return { ok: false, reason: "error", message: "That code couldn't be applied." };
  }
}

/**
 * What this patient has unspent, read-only.
 *
 * Deliberately ignores the checkout hold that `claim_invite_half()`
 * enforces: this answers "is there anything here worth trying for", and the
 * claim answers "may this booking have it". A preview that were to consider
 * the hold would need the same lock the claim takes, which is the whole
 * reason the claim exists.
 */
export async function readInviteHalves(
  admin: AdminClient,
  patientId: string
): Promise<{ welcomePaise: number; rewardPaise: number }> {
  const none = { welcomePaise: 0, rewardPaise: 0 };
  try {
    const [welcome, reward] = await Promise.all([
      admin
        .from("patient_invites")
        .select("welcome_paise")
        .eq("invitee_id", patientId)
        .is("welcome_settled_at", null)
        .maybeSingle(),
      admin
        .from("patient_invites")
        .select("reward_paise")
        .eq("inviter_id", patientId)
        .not("qualified_at", "is", null)
        .is("reward_settled_at", null)
        .order("qualified_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);
    return {
      welcomePaise: welcome.error ? 0 : Number(welcome.data?.welcome_paise ?? 0),
      rewardPaise: reward.error ? 0 : Number(reward.data?.reward_paise ?? 0),
    };
  } catch {
    return none;
  }
}

/** Attaching a half to a booking. Null when it is not available. */
export async function claimInviteHalf(
  admin: AdminClient,
  patientId: string,
  appointmentId: string,
  half: "reward" | "welcome"
): Promise<number | null> {
  try {
    const { data, error } = await admin.rpc("claim_invite_half", {
      p_patient_id: patientId,
      p_appointment_id: appointmentId,
      p_half: half,
    });
    if (error) return null;
    const result = (data ?? {}) as Record<string, unknown>;
    if (result.ok !== true) return null;
    const amount = Number(result.amount_paise ?? 0);
    return amount > 0 ? amount : null;
  } catch {
    return null;
  }
}

/**
 * Settling whichever half paid for this booking.
 *
 * Called from both capture paths, and idempotent, because the browser
 * callback and the webhook race each other by design.
 */
export async function settleInviteHalf(
  admin: AdminClient,
  appointmentId: string,
  source: DiscountSource | null
): Promise<void> {
  if (source !== "invite_reward" && source !== "invite_welcome") return;
  try {
    await admin.rpc("settle_invite_half", {
      p_appointment_id: appointmentId,
      p_half: source === "invite_reward" ? "reward" : "welcome",
    });
  } catch (err) {
    console.error("settle_invite_half failed", err);
  }
}

/**
 * The inviter's half becoming real, because their friend has now paid.
 *
 * Called on every appointment capture and idempotent on the invite row: an
 * invite can only be claimed before the patient's first paid session, so any
 * capture that finds one is that first session. Never throws -- this runs
 * inside payment confirmation, and a booking must never fail for a reward.
 */
export async function grantInviteRewardOnPayment(
  admin: AdminClient,
  patientId: string,
  appointmentId: string
): Promise<void> {
  try {
    await admin.rpc("grant_invite_reward", {
      p_invitee_id: patientId,
      p_appointment_id: appointmentId,
    });
  } catch (err) {
    console.error("grant_invite_reward failed", err);
  }
}

/** What this patient's own code has produced so far, for their dashboard. */
export async function readInviteSummary(
  admin: AdminClient,
  patientId: string
): Promise<{ invited: number; qualified: number; rewardWaitingPaise: number }> {
  const none = { invited: 0, qualified: 0, rewardWaitingPaise: 0 };
  try {
    const { data, error } = await admin
      .from("patient_invites")
      .select("qualified_at, reward_paise, reward_settled_at")
      .eq("inviter_id", patientId);
    if (error || !data) return none;
    const rows = data as {
      qualified_at: string | null;
      reward_paise: number | null;
      reward_settled_at: string | null;
    }[];
    return {
      invited: rows.length,
      qualified: rows.filter((row) => row.qualified_at).length,
      rewardWaitingPaise: rows
        .filter((row) => row.qualified_at && !row.reward_settled_at)
        .reduce((sum, row) => sum + (row.reward_paise ?? 0), 0),
    };
  } catch {
    return none;
  }
}

/**
 * Everything an invite needs doing when a session is paid for.
 *
 * One call rather than three at each site, because both capture paths (the
 * browser callback and the webhook) have to do the same work and a rule
 * that lives in two routes drifts into two rules. Reads the source itself so
 * neither caller has to remember to select it.
 *
 * Never throws and never blocks: the patient has already been charged by the
 * time this runs, so a failure here is a server-log problem, the same
 * posture recordPaymentCapture is called with.
 */
export async function settleInvitesOnCapture(
  admin: AdminClient,
  appointmentId: string
): Promise<void> {
  try {
    const { data } = await admin
      .from("appointments")
      .select("patient_id, discount_source")
      .eq("id", appointmentId)
      .maybeSingle();
    const row = data as { patient_id?: string; discount_source?: string | null } | null;
    if (!row?.patient_id) return;

    // Spending a half is final once the booking it paid for is paid for.
    await settleInviteHalf(
      admin,
      appointmentId,
      (row.discount_source ?? null) as DiscountSource | null
    );

    // And this patient having paid is what makes their inviter's half real.
    // Called unconditionally: an invite can only be claimed before a
    // patient's first paid session, so the function finding one means this
    // is that session, and it is idempotent besides.
    await grantInviteRewardOnPayment(admin, row.patient_id, appointmentId);
  } catch (err) {
    console.error("settleInvitesOnCapture failed", err);
  }
}

import { describe, it, expect } from "vitest";
import {
  normalizeInviteCode,
  isWellFormedInviteCode,
  generateInviteCode,
  formatInviteCode,
  evaluateInviteClaim,
  applyInviteDiscount,
  describeInviteOffer,
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  INVITE_SETTINGS_DEFAULTS,
  type InviteSettings,
  type InviteClaimContext,
} from "@/lib/inviteRewards";
import { MINIMUM_CHARGE_PAISE } from "@/lib/discounts";

const LIST = 120000; // ₹1,200

const settings = (over: Partial<InviteSettings> = {}): InviteSettings => ({
  enabled: true,
  rewardPaise: 20000,
  welcomePaise: 30000,
  maxRewardsPerPatient: 10,
  ...over,
});

const ctx = (over: Partial<InviteClaimContext> = {}): InviteClaimContext => ({
  inviterId: "inviter",
  inviteeId: "invitee",
  inviteeHasPaidBefore: false,
  inviteeAlreadyClaimed: false,
  inviterRewardsEarned: 0,
  ...over,
});

describe("invite codes", () => {
  it("reads one code however it was typed", () => {
    expect(normalizeInviteCode(" abcd-2345 ")).toBe("ABCD2345");
  });

  it("leaves out the characters people read as each other", () => {
    // I/O/0/1 are the four that get misread off a phone screen.
    for (const char of ["I", "O", "0", "1"]) {
      expect(INVITE_CODE_ALPHABET).not.toContain(char);
    }
  });

  it("generates a well-formed code from injected randomness", () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 250, 251, 252, 253]);
    const generated = generateInviteCode(bytes);
    expect(generated).toHaveLength(INVITE_CODE_LENGTH);
    expect(isWellFormedInviteCode(generated)).toBe(true);
  });

  it("rejects a code of the wrong shape", () => {
    expect(isWellFormedInviteCode("ABCD234")).toBe(false);
    expect(isWellFormedInviteCode("ABCD2340")).toBe(false); // 0 is not in the alphabet
    expect(isWellFormedInviteCode(null)).toBe(false);
  });

  it("shows a code in halves and stores it whole", () => {
    expect(formatInviteCode("ABCD2345")).toBe("ABCD-2345");
    expect(normalizeInviteCode(formatInviteCode("ABCD2345"))).toBe("ABCD2345");
  });
});

describe("evaluateInviteClaim", () => {
  it("accepts a new patient claiming somebody else's code", () => {
    const result = evaluateInviteClaim(ctx(), settings());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.welcomePaise).toBe(30000);
      expect(result.rewardPaise).toBe(20000);
    }
  });

  it("refuses a patient claiming their own code", () => {
    const result = evaluateInviteClaim(ctx({ inviterId: "invitee" }), settings());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("self");
  });

  it("refuses a patient who has already used one", () => {
    const result = evaluateInviteClaim(ctx({ inviteeAlreadyClaimed: true }), settings());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("already_claimed");
  });

  it("refuses an established patient -- you are new exactly once", () => {
    const result = evaluateInviteClaim(ctx({ inviteeHasPaidBefore: true }), settings());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_new");
  });

  it("refuses once the inviter has earned their ceiling", () => {
    const result = evaluateInviteClaim(
      ctx({ inviterRewardsEarned: 10 }),
      settings({ maxRewardsPerPatient: 10 })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("inviter_capped");
  });

  it("does not tell the invitee about the inviter's account", () => {
    const result = evaluateInviteClaim(ctx({ inviterRewardsEarned: 99 }), settings());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).not.toMatch(/reward|cap|limit/i);
    }
  });

  it("refuses an unrecognised code", () => {
    const result = evaluateInviteClaim(ctx({ inviterId: null }), settings());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unknown_code");
  });

  it("refuses everything while invites are switched off", () => {
    const result = evaluateInviteClaim(ctx(), settings({ enabled: false }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("disabled");
  });

  it("ships switched off", () => {
    expect(INVITE_SETTINGS_DEFAULTS.enabled).toBe(false);
    expect(evaluateInviteClaim(ctx(), INVITE_SETTINGS_DEFAULTS).ok).toBe(false);
  });
});

describe("applyInviteDiscount", () => {
  it("records which half paid for the booking", () => {
    expect(applyInviteDiscount(LIST, 20000, "reward").source).toBe("invite_reward");
    expect(applyInviteDiscount(LIST, 30000, "welcome").source).toBe("invite_welcome");
  });

  it("takes the amount off", () => {
    expect(applyInviteDiscount(LIST, 30000, "welcome").payablePaise).toBe(90000);
  });

  it("floors an amount larger than a cheap session's price", () => {
    expect(applyInviteDiscount(9000, 30000, "welcome").payablePaise).toBe(MINIMUM_CHARGE_PAISE);
  });

  it("does nothing when the half is unconfigured", () => {
    expect(applyInviteDiscount(LIST, 0, "reward").source).toBeNull();
  });
});

describe("describeInviteOffer", () => {
  it("states the condition rather than burying it", () => {
    const line = describeInviteOffer(settings());
    expect(line).toContain("₹300");
    expect(line).toContain("₹200");
    // The reward lands on a paid session, not a signup, and the patient
    // should hear the real promise before sending the code to anybody.
    expect(line).toMatch(/once they/i);
  });

  it("says nothing when there is nothing to offer", () => {
    expect(describeInviteOffer(settings({ enabled: false }))).toBeNull();
    expect(describeInviteOffer(settings({ rewardPaise: 0, welcomePaise: 0 }))).toBeNull();
  });
});

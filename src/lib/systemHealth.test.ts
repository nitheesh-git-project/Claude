import { describe, it, expect } from "vitest";
import {
  buildSystemHealth,
  copyTextFor,
  formatCheckedAgo,
  healthBannerText,
  needsPerson,
  summarizeHealth,
  STATUS_LABEL,
  type SystemHealthInput,
} from "@/lib/systemHealth";
import { EMPTY_ACCOUNTING_HEALTH, type AccountingHealth } from "@/lib/accountingHealth";

const CLEAN_ACCOUNTING: AccountingHealth = {
  ...EMPTY_ACCOUNTING_HEALTH,
  available: true,
  entitlementCount: 3,
};

const ALL_WELL: SystemHealthInput = {
  webhookSecretConfigured: true,
  google: { state: "connected", meetScope: true },
  syncIssues: [],
  waitingRoomIssues: [],
  accounting: CLEAN_ACCOUNTING,
  openAccessEnabled: true,
};

describe("buildSystemHealth", () => {
  it("reports every check healthy when nothing is wrong", () => {
    const checks = buildSystemHealth(ALL_WELL);
    expect(checks).toHaveLength(5);
    expect(checks.every((c) => c.status === "healthy")).toBe(true);
    // A healthy check must not ask the reader to do anything.
    expect(checks.every((c) => c.fix.length === 0)).toBe(true);
  });

  // The teaching half is the whole point of the (i) button: a check with no
  // explanation behind it is the wall of prose this screen replaced.
  it("gives every check a headline, an explanation and an example", () => {
    for (const input of [ALL_WELL, { ...ALL_WELL, webhookSecretConfigured: false }]) {
      for (const check of buildSystemHealth(input)) {
        expect(check.headline.length).toBeGreaterThan(0);
        expect(check.what.length).toBeGreaterThan(0);
        expect(check.example.length).toBeGreaterThan(0);
      }
    }
  });

  // A red card with no way out is exactly the screen an owner cannot act on.
  it("gives steps for every status that asks for a person", () => {
    const broken: SystemHealthInput = {
      webhookSecretConfigured: false,
      google: { state: "broken", deadToken: true, detail: "invalid_grant" },
      syncIssues: [{ autoRetryExhausted: true }],
      waitingRoomIssues: [{ autoRetryExhausted: true }],
      accounting: {
        available: true,
        entitlementCount: 4,
        balanceMismatches: [
          {
            entitlementId: "e1",
            patientId: "p1",
            problem: "cache_ledger_mismatch",
            cachedAvailable: 4,
            ledgerAvailable: 3,
            legacyAvailable: 4,
          },
        ],
        unmatchedPayments: [],
        sessionsWithoutBacking: [],
      },
      openAccessEnabled: true,
    };
    for (const check of buildSystemHealth(broken)) {
      if (needsPerson(check.status)) expect(check.fix.length).toBeGreaterThan(0);
    }
  });

  it("calls a missing webhook secret broken, since money can be lost", () => {
    const [payments] = buildSystemHealth({ ...ALL_WELL, webhookSecretConfigured: false });
    expect(payments.status).toBe("broken");
  });

  // An owner who never wired Google up has not got a fault, and painting it
  // red is how red stops meaning anything.
  it("calls Google that was never set up 'off', not broken", () => {
    const checks = buildSystemHealth({
      ...ALL_WELL,
      google: { state: "not_configured", missing: ["GOOGLE_CALENDAR_REFRESH_TOKEN"] },
    });
    const google = checks.find((c) => c.id === "google")!;
    expect(google.status).toBe("off");
    expect(needsPerson(google.status)).toBe(false);
    // The missing variable is named, or the steps cannot be followed.
    expect(google.fix.join(" ")).toContain("GOOGLE_CALENDAR_REFRESH_TOKEN");
  });

  it("flags a connection with no Meet permission without calling it broken", () => {
    const google = buildSystemHealth({
      ...ALL_WELL,
      google: { state: "connected", meetScope: false },
    }).find((c) => c.id === "google")!;
    expect(google.status).toBe("attention");
  });

  it("does not treat an unprobed Google connection as evidence of a fault", () => {
    const google = buildSystemHealth({ ...ALL_WELL, google: undefined }).find(
      (c) => c.id === "google"
    )!;
    expect(google.status).toBe("unknown");
    expect(needsPerson(google.status)).toBe(false);
  });

  // Retrying a session link cannot work while the credential is dead, and
  // each attempt spends one of that session's capped tries.
  it("sends the owner to the Google panel when links fail with a dead credential", () => {
    const sync = buildSystemHealth({
      ...ALL_WELL,
      google: { state: "broken", deadToken: true, detail: "invalid_grant" },
      syncIssues: [{ autoRetryExhausted: false }, { autoRetryExhausted: false }],
    }).find((c) => c.id === "sync")!;
    expect(sync.status).toBe("broken");
    expect(sync.fix[0]).toContain("Google Connection");
    expect(sync.count).toBe(2);
  });

  it("separates links still retrying from links that have given up", () => {
    const retrying = buildSystemHealth({
      ...ALL_WELL,
      syncIssues: [{ autoRetryExhausted: false }],
    }).find((c) => c.id === "sync")!;
    expect(retrying.status).toBe("attention");

    const stuck = buildSystemHealth({
      ...ALL_WELL,
      syncIssues: [{ autoRetryExhausted: true }],
    }).find((c) => c.id === "sync")!;
    expect(stuck.status).toBe("broken");
  });

  it("calls the waiting room 'off' when open access is switched off", () => {
    const wr = buildSystemHealth({ ...ALL_WELL, openAccessEnabled: false }).find(
      (c) => c.id === "waiting_room"
    )!;
    expect(wr.status).toBe("off");
  });

  // A balance disagreeing with its own history makes a number in the product
  // wrong; the other two findings are untidy rather than incorrect.
  it("ranks a disagreeing balance above the other accounting findings", () => {
    const withBalance = buildSystemHealth({
      ...ALL_WELL,
      accounting: {
        ...CLEAN_ACCOUNTING,
        balanceMismatches: [
          {
            entitlementId: "e1",
            patientId: "p1",
            problem: "cache_ledger_mismatch",
            cachedAvailable: 4,
            ledgerAvailable: 3,
            legacyAvailable: null,
          },
        ],
      },
    }).find((c) => c.id === "accounting")!;
    expect(withBalance.status).toBe("broken");

    const withPayment = buildSystemHealth({
      ...ALL_WELL,
      accounting: {
        ...CLEAN_ACCOUNTING,
        unmatchedPayments: [
          { id: "pay1", razorpayPaymentId: "pay_x", amountPaise: 120000, capturedAt: null },
        ],
      },
    }).find((c) => c.id === "accounting")!;
    expect(withPayment.status).toBe("attention");
    expect(withPayment.count).toBe(1);
  });

  it("says the accounting check could not run rather than claiming all clear", () => {
    const acc = buildSystemHealth({
      ...ALL_WELL,
      accounting: EMPTY_ACCOUNTING_HEALTH,
    }).find((c) => c.id === "accounting")!;
    expect(acc.status).toBe("unknown");
    expect(acc.headline).not.toMatch(/all clear/i);
  });
});

describe("summarizeHealth", () => {
  it("says all clear when every check is healthy", () => {
    const summary = summarizeHealth(buildSystemHealth(ALL_WELL));
    expect(summary.needsPerson).toBe(0);
    expect(summary.worst).toBe("healthy");
    expect(summary.headline).toBe("All 5 checks healthy");
    expect(summary.attention).toHaveLength(0);
  });

  // The strip's count and the chips beneath it are the same rows, the same
  // rule the admin dashboard's other counts follow.
  it("counts exactly the checks it offers as chips", () => {
    const summary = summarizeHealth(
      buildSystemHealth({
        ...ALL_WELL,
        webhookSecretConfigured: false,
        syncIssues: [{ autoRetryExhausted: false }],
      })
    );
    expect(summary.needsPerson).toBe(summary.attention.length);
    expect(summary.needsPerson).toBe(2);
    expect(summary.headline).toBe("2 checks need you");
  });

  it("reads as singular for one failing check", () => {
    const summary = summarizeHealth(
      buildSystemHealth({ ...ALL_WELL, webhookSecretConfigured: false })
    );
    expect(summary.headline).toBe("1 check needs you");
  });

  // "Not set up" is not a fault, so the strip must not go amber over it --
  // but it must not claim all-clear either.
  it("distinguishes 'nothing broken' from 'everything checked'", () => {
    const summary = summarizeHealth(
      buildSystemHealth({ ...ALL_WELL, openAccessEnabled: false })
    );
    expect(summary.needsPerson).toBe(0);
    expect(summary.worst).toBe("off");
    expect(summary.headline).toBe("Nothing is broken");
  });

  it("labels every status in words, never colour alone", () => {
    for (const check of buildSystemHealth(ALL_WELL)) {
      expect(STATUS_LABEL[check.status]).toBeTruthy();
    }
  });
});

describe("healthBannerText", () => {
  it("says nothing when nothing is red", () => {
    // Amber is "look at this today", and a banner on Today for it is a
    // banner an admin learns to dismiss without reading.
    expect(healthBannerText(buildSystemHealth(ALL_WELL))).toBeNull();
    const amber = buildSystemHealth({
      ...ALL_WELL,
      google: { state: "connected", meetScope: false },
    });
    expect(healthBannerText(amber)).toBeNull();
  });

  it("names the red check and carries its own headline", () => {
    const banner = healthBannerText(
      buildSystemHealth({ ...ALL_WELL, webhookSecretConfigured: false })
    )!;
    expect(banner.title).toBe("Payment Confirmations needs you");
    expect(banner.detail).toContain("browser alone");
  });

  it("reads as a list when more than one is red", () => {
    const banner = healthBannerText(
      buildSystemHealth({
        ...ALL_WELL,
        webhookSecretConfigured: false,
        google: { state: "broken", deadToken: true, detail: "invalid_grant" },
      })
    )!;
    expect(banner.title).toBe("Payment Confirmations and Google Connection need you");
  });
});

describe("formatCheckedAgo", () => {
  it("rounds down to whole minutes and reads as English", () => {
    expect(formatCheckedAgo(0)).toBe("just now");
    expect(formatCheckedAgo(59_000)).toBe("just now");
    expect(formatCheckedAgo(60_000)).toBe("1 minute ago");
    expect(formatCheckedAgo(9 * 60_000)).toBe("9 minutes ago");
    expect(formatCheckedAgo(65 * 60_000)).toBe("over an hour ago");
    expect(formatCheckedAgo(5 * 3600_000)).toBe("5 hours ago");
    expect(formatCheckedAgo(48 * 3600_000)).toBe("more than a day ago");
  });

  it("never reads as the future when clocks disagree", () => {
    expect(formatCheckedAgo(-5000)).toBe("just now");
    expect(formatCheckedAgo(Number.NaN)).toBe("just now");
  });
});

describe("copyTextFor", () => {
  it("carries the status, the headline and every step", () => {
    const check = buildSystemHealth({ ...ALL_WELL, webhookSecretConfigured: false })[0];
    const text = copyTextFor(check);
    expect(text).toContain("Payment Confirmations - Needs you now");
    expect(text).toContain(check.headline);
    for (const step of check.fix) expect(text).toContain(step);
    expect(text).toContain("1.");
  });

  it("still says something useful for a check with no steps", () => {
    const healthy = buildSystemHealth(ALL_WELL)[0];
    expect(copyTextFor(healthy)).toContain("Healthy");
    expect(copyTextFor(healthy)).not.toContain("Steps:");
  });
});

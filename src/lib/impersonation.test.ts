import { describe, it, expect } from "vitest";
import {
  IMPERSONATION_REASON_MIN,
  IMPERSONATION_TTL_MS,
  dashboardPathFor,
  isExpired,
  isImpersonatableRole,
  minutesLeft,
  parseMarker,
  refuseImpersonation,
  type ImpersonationMarker,
  type StartCandidate,
} from "@/lib/impersonation";

const ADMIN = "admin-1";

function candidate(over: Partial<StartCandidate> = {}): StartCandidate {
  return {
    adminId: ADMIN,
    adminScope: "full",
    reason: "Patient says her session link is missing",
    target: { id: "patient-1", role: "patient", active: true },
    ...over,
  };
}

describe("refuseImpersonation", () => {
  it("lets a Master Admin open a patient's dashboard with a real reason", () => {
    expect(refuseImpersonation(candidate())).toBeNull();
  });

  // Not a section scope: requireAdminScope("people") would hand the deepest
  // read in the product to whoever can edit a phone number.
  it("refuses every scope but full", () => {
    for (const scope of ["operations", "finance", "clinical"]) {
      expect(refuseImpersonation(candidate({ adminScope: scope }))).toBe("not_master_admin");
    }
  });

  // Impersonating a colleague is one admin using another's authority, and an
  // admin having trouble can simply be asked what they see.
  it("refuses another admin, suspended or not", () => {
    expect(
      refuseImpersonation(candidate({ target: { id: "admin-2", role: "admin", active: true } }))
    ).toBe("target_is_admin");
    expect(
      refuseImpersonation(candidate({ target: { id: "admin-2", role: "admin", active: false } }))
    ).toBe("target_is_admin");
  });

  it("refuses a reason that says nothing", () => {
    expect(refuseImpersonation(candidate({ reason: "test" }))).toBe("no_reason");
    expect(refuseImpersonation(candidate({ reason: "   " }))).toBe("no_reason");
    expect(refuseImpersonation(candidate({ reason: "x".repeat(IMPERSONATION_REASON_MIN) }))).toBeNull();
  });

  it("refuses a missing account, an unknown role and a suspended one", () => {
    expect(refuseImpersonation(candidate({ target: null }))).toBe("target_missing");
    expect(
      refuseImpersonation(candidate({ target: { id: "x", role: "wizard", active: true } }))
    ).toBe("target_missing");
    expect(
      refuseImpersonation(candidate({ target: { id: "p", role: "patient", active: false } }))
    ).toBe("target_inactive");
  });

  it("refuses the admin's own account", () => {
    expect(
      refuseImpersonation(candidate({ target: { id: ADMIN, role: "patient", active: true } }))
    ).toBe("target_is_self");
  });

  // The scope answer comes first: nothing about the target is worth telling
  // somebody who cannot do this at all.
  it("names the scope before anything about the target", () => {
    expect(
      refuseImpersonation(
        candidate({ adminScope: "clinical", reason: "no", target: null })
      )
    ).toBe("not_master_admin");
  });
});

describe("the marker", () => {
  const marker: ImpersonationMarker = {
    sessionId: "s1",
    adminId: ADMIN,
    targetId: "patient-1",
    targetRole: "patient",
    targetName: "Priya Sharma",
    expiresAt: 1_000_000,
  };

  it("round-trips through the cookie", () => {
    expect(parseMarker(JSON.stringify(marker))).toEqual(marker);
  });

  // A half-read marker must never be read as "not impersonating" by one
  // surface and "impersonating" by another -- the banner would go missing
  // while the swap ran underneath it.
  it("treats anything malformed as no marker at all", () => {
    expect(parseMarker(undefined)).toBeNull();
    expect(parseMarker("")).toBeNull();
    expect(parseMarker("not json")).toBeNull();
    expect(parseMarker(JSON.stringify({ ...marker, targetRole: "admin" }))).toBeNull();
    expect(parseMarker(JSON.stringify({ ...marker, expiresAt: "soon" }))).toBeNull();
    const missingName: Record<string, unknown> = { ...marker };
    delete missingName.targetName;
    expect(parseMarker(JSON.stringify(missingName))).toBeNull();
  });

  it("expires on the window, not on the cookie's own lifetime", () => {
    expect(isExpired(marker, marker.expiresAt - 1)).toBe(false);
    expect(isExpired(marker, marker.expiresAt)).toBe(true);
    expect(isExpired(marker, marker.expiresAt + 1)).toBe(true);
  });

  it("counts the minutes left up, never down past zero", () => {
    expect(minutesLeft(marker, marker.expiresAt - 90_000)).toBe(2);
    expect(minutesLeft(marker, marker.expiresAt - 1)).toBe(1);
    expect(minutesLeft(marker, marker.expiresAt + 60_000)).toBe(0);
  });
});

describe("the window and the landing", () => {
  it("is half an hour, not a working day", () => {
    expect(IMPERSONATION_TTL_MS).toBe(30 * 60 * 1000);
  });

  it("lands on the dashboard that role actually has", () => {
    expect(dashboardPathFor("patient")).toBe("/patient/dashboard");
    expect(dashboardPathFor("therapist")).toBe("/therapist/dashboard");
    expect(dashboardPathFor("hospital")).toBe("/hospital/dashboard");
  });

  it("knows which roles may be opened", () => {
    expect(isImpersonatableRole("patient")).toBe(true);
    expect(isImpersonatableRole("admin")).toBe(false);
    expect(isImpersonatableRole(null)).toBe(false);
  });
});

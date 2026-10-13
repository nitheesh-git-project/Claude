import { describe, expect, it } from "vitest";
import {
  isBookedAwaitingTherapist,
  patientSessionStatus,
  PROGRAMME_BOOKED_LABEL,
  sessionRowStatus,
} from "./sessionRowStatus";

describe("sessionRowStatus", () => {
  it("names each status in one word", () => {
    expect(sessionRowStatus("requested").label).toBe("Requested");
    expect(sessionRowStatus("confirmed").label).toBe("Confirmed");
    expect(sessionRowStatus("completed").label).toBe("Completed");
    expect(sessionRowStatus("cancelled").label).toBe("Cancelled");
  });

  it("says no-show rather than completed for a session nobody attended", () => {
    expect(sessionRowStatus("completed", true)).toEqual({ label: "No-show", tone: "warn" });
  });

  it("never prints a raw column value for an unexpected status", () => {
    expect(sessionRowStatus("pending_payment").label).toBe("Pending payment");
    expect(sessionRowStatus("").label).toBe("Unknown");
  });
});

describe("patientSessionStatus", () => {
  it("says a programme session waiting on the clinic is booked, not requested", () => {
    expect(
      patientSessionStatus({ status: "requested", therapist_id: null, package_purchase_id: "p1" })
    ).toEqual({ label: PROGRAMME_BOOKED_LABEL, tone: "info" });
    expect(
      patientSessionStatus({ status: "requested", therapist_id: null, home_visit_purchase_id: "h1" }).label
    ).toBe("Booked - confirming your therapist");
  });

  it("keeps Requested for a single consultation not drawn from a programme", () => {
    expect(patientSessionStatus({ status: "requested", therapist_id: null }).label).toBe("Requested");
  });

  it("stops saying it once a therapist is on the session", () => {
    // An assigned cash visit stays `requested` until it is paid; it is not
    // waiting on a therapist any more.
    expect(
      patientSessionStatus({ status: "requested", therapist_id: "t1", home_visit_purchase_id: "h1" }).label
    ).toBe("Requested");
    expect(
      patientSessionStatus({ status: "confirmed", therapist_id: "t1", package_purchase_id: "p1" }).label
    ).toBe("Confirmed");
  });

  it("leaves cancelled, completed and no-show alone", () => {
    expect(patientSessionStatus({ status: "cancelled", package_purchase_id: "p1" }).label).toBe("Cancelled");
    expect(patientSessionStatus({ status: "completed", no_show: true, package_purchase_id: "p1" }).label).toBe(
      "No-show"
    );
  });

  it("isBookedAwaitingTherapist needs a purchase, no therapist and requested", () => {
    expect(isBookedAwaitingTherapist({ status: "requested", package_purchase_id: "p1" })).toBe(true);
    expect(isBookedAwaitingTherapist({ status: "confirmed", package_purchase_id: "p1" })).toBe(false);
    expect(isBookedAwaitingTherapist({ status: "requested" })).toBe(false);
  });
});

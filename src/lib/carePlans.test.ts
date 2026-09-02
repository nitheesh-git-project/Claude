import { describe, it, expect } from "vitest";
import {
  buildOfferSnapshot,
  parseOfferSnapshot,
  carePlanState,
  isCarePlanPurchasable,
  CARE_PLAN_STATE_LABELS,
  validateCarePlanInput,
  narrowToCategory,
  type CarePlanStatus,
  type CarePlanState,
} from "@/lib/carePlans";

const NOW = Date.parse("2026-09-01T00:00:00Z");
const future = new Date(NOW + 86_400_000).toISOString();
const past = new Date(NOW - 86_400_000).toISOString();

describe("buildOfferSnapshot", () => {
  it("reads the right column per catalog", () => {
    const online = buildOfferSnapshot("session_package", {
      title: "Six", session_count: 6, price_paise: 899900, session_duration_minutes: 45,
      max_sessions_per_week: 3, travel_fee_included: true,
    });
    expect(online.sessionCount).toBe(6);
    expect(online.sessionDurationMinutes).toBe(45);
    expect(online.maxPerWeek).toBe(3);
    // travel_fee_included is a home-visit column; an online package must
    // never inherit it, or the charge silently drops the travel line.
    expect(online.travelFeeIncluded).toBe(false);

    const home = buildOfferSnapshot("home_visit_package", {
      title: "Four", visit_count: 4, price_paise: 1200000, visit_duration_minutes: 60,
      max_visits_per_week: 2, travel_fee_included: true,
    });
    expect(home.sessionCount).toBe(4);
    expect(home.sessionDurationMinutes).toBe(60);
    expect(home.maxPerWeek).toBe(2);
    expect(home.travelFeeIncluded).toBe(true);
  });

  it("defaults therapistLocked to on", () => {
    expect(buildOfferSnapshot("session_package", { title: "x" }).therapistLocked).toBe(true);
    expect(
      buildOfferSnapshot("session_package", { title: "x", therapist_locked: false }).therapistLocked
    ).toBe(false);
  });
});

describe("parseOfferSnapshot", () => {
  it("round-trips what buildOfferSnapshot wrote", () => {
    const built = buildOfferSnapshot("home_visit_package", {
      title: "Four", visit_count: 4, price_paise: 1200000, travel_fee_included: true,
    });
    expect(parseOfferSnapshot(JSON.parse(JSON.stringify(built)))).toEqual(built);
  });

  it("reads an older snapshot as travel-not-included", () => {
    // Snapshots written before travel was charged on a recommendation have
    // no such key. False is the safe direction: travel is shown as its own
    // line rather than silently assumed covered.
    const old = parseOfferSnapshot({ title: "Four", sessionCount: 4, pricePaise: 1200000 });
    expect(old?.travelFeeIncluded).toBe(false);
  });

  it("rejects junk", () => {
    expect(parseOfferSnapshot(null)).toBeNull();
    expect(parseOfferSnapshot("nope")).toBeNull();
    expect(parseOfferSnapshot({ sessionCount: 4 })).toBeNull();
  });
});

describe("carePlanState", () => {
  it("is computed on read, never stored as expired", () => {
    const open = carePlanState({ status: "active" }, { expires_at: future }, NOW);
    expect(open).toBe("awaiting_patient");
    const lapsed = carePlanState({ status: "active" }, { expires_at: past }, NOW);
    expect(lapsed).toBe("lapsed");
  });

  it("keeps a purchased plan purchased even past its expiry", () => {
    // Otherwise a patient who paid would watch their plan expire.
    expect(carePlanState({ status: "accepted" }, { expires_at: past }, NOW)).toBe("accepted");
  });

  it.each<[CarePlanStatus, CarePlanState]>([
    ["declined", "declined"],
    ["withdrawn", "withdrawn"],
    ["superseded", "superseded"],
    ["expired", "superseded"],
  ])("maps %s", (status, expected) => {
    expect(carePlanState({ status }, { expires_at: future }, NOW)).toBe(expected);
  });

  it("only one state can be paid for", () => {
    const states: CarePlanState[] = [
      "awaiting_patient", "lapsed", "accepted", "declined", "withdrawn", "superseded",
    ];
    expect(states.filter(isCarePlanPurchasable)).toEqual(["awaiting_patient"]);
  });

  it("treats an unparseable expiry as still open rather than lapsed", () => {
    expect(carePlanState({ status: "active" }, { expires_at: "not-a-date" }, NOW)).toBe(
      "awaiting_patient"
    );
  });
});

describe("validateCarePlanInput", () => {
  const snapshot = buildOfferSnapshot("session_package", {
    title: "Six", session_count: 6, price_paise: 899900, max_sessions_per_week: 3,
  });
  const base = {
    offerKind: "session_package" as const,
    packageId: "p1",
    handsOnRequired: false,
    frequencyPerWeek: 2,
    clinicalRationale: "Ongoing lumbar instability.",
    instructions: "Keep the daily walk going.",
  };

  it("accepts a plan inside every cap", () => {
    expect(validateCarePlanInput(base, snapshot, { maxFrequencyPerWeek: 5 }).ok).toBe(true);
  });

  it("refuses a frequency the package's own rules would reject", () => {
    // Otherwise the therapist writes a plan the booking code refuses, and
    // the patient discovers it at checkout.
    const r = validateCarePlanInput({ ...base, frequencyPerWeek: 4 }, snapshot, {
      maxFrequencyPerWeek: 5,
    });
    expect(r.ok).toBe(false);
  });

  it("refuses a frequency above the clinic-wide cap", () => {
    const loose = buildOfferSnapshot("session_package", { title: "x", session_count: 6, price_paise: 1 });
    expect(validateCarePlanInput({ ...base, frequencyPerWeek: 7 }, loose, {
      maxFrequencyPerWeek: 5,
    }).ok).toBe(false);
  });

  it("allows no frequency at all", () => {
    expect(
      validateCarePlanInput({ ...base, frequencyPerWeek: null }, snapshot, { maxFrequencyPerWeek: 5 }).ok
    ).toBe(true);
  });
});

describe("narrowToCategory", () => {
  const ortho = { id: "a", categoryId: "cat-ortho" };
  const neuro = { id: "b", categoryId: "cat-neuro" };
  const unattached = { id: "c", categoryId: null };
  const all = [ortho, neuro, unattached];

  it("keeps the matching category and drops the others", () => {
    expect(narrowToCategory(all, "cat-ortho").map((o) => o.id)).toEqual(["a", "c"]);
  });

  it("offers an unattached package everywhere rather than nowhere", () => {
    expect(narrowToCategory(all, "cat-neuro")).toContain(unattached);
  });

  it("returns everything for a session with no category", () => {
    // A session recorded before appointments carried category_id. Narrowing
    // it to nothing would hide the whole feature on old rows.
    expect(narrowToCategory(all, null)).toEqual(all);
  });
});

describe("carePlanState with a review step", () => {
  it("never reports a queued plan as waiting on the patient", () => {
    // The whole point of the review step. `isCarePlanPurchasable` is what
    // /api/care-plan/create-order asks, so a pending plan falling through
    // to the default would sell a programme nobody at the clinic approved.
    const state = carePlanState(
      { status: "pending_review" as CarePlanStatus },
      { expires_at: null },
      NOW
    );
    expect(state).toBe<CarePlanState>("pending_review");
    expect(isCarePlanPurchasable(state)).toBe(false);
  });

  it("never reports a rejected plan as purchasable", () => {
    const state = carePlanState(
      { status: "rejected" as CarePlanStatus },
      { expires_at: future },
      NOW
    );
    expect(state).toBe<CarePlanState>("rejected");
    expect(isCarePlanPurchasable(state)).toBe(false);
  });

  it("does not lapse a queued plan that has no window yet", () => {
    // A version is written with a null expires_at and stamped at approval,
    // so "no window" means "not published", never "expired".
    expect(
      carePlanState({ status: "pending_review" as CarePlanStatus }, null, NOW)
    ).toBe<CarePlanState>("pending_review");
  });

  it("still lapses an approved plan past its window", () => {
    expect(
      carePlanState({ status: "active" as CarePlanStatus }, { expires_at: past }, NOW)
    ).toBe<CarePlanState>("lapsed");
  });

  it("labels every state, including the two the review step added", () => {
    // A state with no label renders as its raw column value on an admin
    // screen, which is how "pending_review" ends up in front of a person.
    for (const state of [
      "pending_review",
      "rejected",
      "awaiting_patient",
      "lapsed",
      "accepted",
      "declined",
      "withdrawn",
      "superseded",
    ] as CarePlanState[]) {
      expect(CARE_PLAN_STATE_LABELS[state]).toBeTruthy();
    }
  });
});

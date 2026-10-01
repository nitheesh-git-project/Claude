import { describe, expect, it } from "vitest";
import { hospitalSessionLine, type HospitalSessionInput } from "@/lib/hospitalEarnings";
import { moneyLineFor, type MetricsAppointment } from "@/lib/adminMetrics";

const H = "hospital-1";

function session(over: Partial<HospitalSessionInput> = {}): HospitalSessionInput {
  return {
    id: "a1",
    patient_id: "p1",
    slot_time: "2026-09-01T10:00:00Z",
    timezone: "Asia/Kolkata",
    status: "completed",
    payment_status: "paid",
    amount_paid_paise: 100000,
    refund_status: null,
    refund_amount_paise: null,
    hospital_share_percent_at_completion: 10,
    hospital_id_at_completion: H,
    ...over,
  };
}

describe("hospitalSessionLine", () => {
  it("takes the commission at the rate frozen at completion, not today's", () => {
    const line = hospitalSessionLine(session(), H, 25);
    expect(line?.partnerCutPaise).toBe(10000);
    expect(line?.sharePercent).toBe(10);
  });

  it("falls back to the live rate only for a row with no snapshot at all", () => {
    const s = session();
    delete s.hospital_share_percent_at_completion;
    delete s.hospital_id_at_completion;
    expect(hospitalSessionLine(s, H, 25)?.partnerCutPaise).toBe(25000);
  });

  it("earns nothing on a session another partner, or none, was credited with", () => {
    expect(hospitalSessionLine(session({ hospital_id_at_completion: "other" }), H, 10)).toBeNull();
    expect(hospitalSessionLine(session({ hospital_id_at_completion: null }), H, 10)).toBeNull();
  });

  it("counts a delivered pay-later session before the patient settles", () => {
    const line = hospitalSessionLine(
      session({ payment_status: "pending", payment_terms: "pay_later", amount_paid_paise: null, amount_due_paise: 80000 }),
      H,
      10
    );
    expect(line?.netPaise).toBe(80000);
    expect(line?.partnerCutPaise).toBe(8000);
  });

  it("takes the commission on what the clinic kept after a processed refund", () => {
    const line = hospitalSessionLine(
      session({ refund_status: "processed", refund_amount_paise: 40000 }),
      H,
      10
    );
    expect(line?.netPaise).toBe(60000);
    expect(line?.partnerCutPaise).toBe(6000);
  });

  it("ignores anything not completed", () => {
    expect(hospitalSessionLine(session({ status: "confirmed" }), H, 10)).toBeNull();
    expect(hospitalSessionLine(session({ status: "cancelled" }), H, 10)).toBeNull();
  });

  it("agrees with the admin Money screen's figure for the same session", () => {
    const s = session();
    const admin = moneyLineFor(
      {
        ...s,
        category_id: null,
        therapist_id: "t1",
        created_at: s.slot_time!,
        paid_at: s.slot_time,
        no_show: false,
        concern: null,
        therapist_share_percent_at_completion: 50,
      } as unknown as MetricsAppointment,
      {
        therapistSharePercent: { t1: 50 },
        patientHospitalSharePercent: { p1: 25 },
        hospitalReferredPatientIds: { p1: true },
      }
    );
    expect(hospitalSessionLine(s, H, 25)?.partnerCutPaise).toBe(admin?.hospitalCutPaise);
  });
});

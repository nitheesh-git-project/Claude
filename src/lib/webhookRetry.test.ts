import { describe, expect, it } from "vitest";
import { WEBHOOK_IN_FLIGHT_MS, WEBHOOK_RETRYABLE_PREFIX, webhookRetryVerdict } from "@/lib/webhookRetry";

const NOW = Date.parse("2026-10-01T10:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("webhookRetryVerdict", () => {
  it("acknowledges an event that was processed cleanly", () => {
    expect(
      webhookRetryVerdict({ processed_at: ago(5000), processing_error: null, received_at: ago(6000) }, NOW)
    ).toBe("duplicate");
  });

  it("acknowledges a permanent, non-retryable outcome", () => {
    expect(
      webhookRetryVerdict(
        { processed_at: ago(5000), processing_error: "capture event carried no order id", received_at: ago(6000) },
        NOW
      )
    ).toBe("duplicate");
  });

  it("lets a retry of a failed capture try again instead of calling it a duplicate", () => {
    expect(
      webhookRetryVerdict(
        {
          processed_at: ago(5000),
          processing_error: `${WEBHOOK_RETRYABLE_PREFIX}record_payment_capture failed`,
          received_at: ago(6000),
        },
        NOW
      )
    ).toBe("retry");
  });

  it("does not race an attempt that is still running", () => {
    expect(
      webhookRetryVerdict({ processed_at: null, processing_error: null, received_at: ago(10_000) }, NOW)
    ).toBe("in_flight");
  });

  it("takes over an attempt that died without recording an outcome", () => {
    expect(
      webhookRetryVerdict(
        { processed_at: null, processing_error: null, received_at: ago(WEBHOOK_IN_FLIGHT_MS + 1000) },
        NOW
      )
    ).toBe("retry");
  });
});

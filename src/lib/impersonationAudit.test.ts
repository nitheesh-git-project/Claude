import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

import { isImpersonatedWrite } from "@/lib/impersonationAudit";

describe("isImpersonatedWrite", () => {
  it("records a change made through the API during a window", () => {
    expect(isImpersonatedWrite("POST", "/api/appointments/create", true)).toBe(true);
    expect(isImpersonatedWrite("DELETE", "/api/patient/medical-documents/delete", true)).toBe(true);
  });

  it("ignores reads, requests outside a window, and the routes that record themselves", () => {
    expect(isImpersonatedWrite("GET", "/api/appointments/create", true)).toBe(false);
    expect(isImpersonatedWrite("POST", "/api/appointments/create", false)).toBe(false);
    expect(isImpersonatedWrite("POST", "/api/admin/stop-impersonation", true)).toBe(false);
    expect(isImpersonatedWrite("POST", "/patient/dashboard", true)).toBe(false);
  });
});

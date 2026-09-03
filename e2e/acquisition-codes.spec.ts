// Promo codes and patient invites -- the two acquisition discounts a patient
// can trigger themselves.
//
// The assertions worth having here are the ones about what a browser can
// make happen. Both features take something the patient sends: a promo code
// is an identifier they type, and an invite code is somebody else's name for
// their own account. Neither may become a way of choosing what to pay, and
// neither may be claimed twice.
//
// So the money-critical checks are: a code's cap holds under a second claim,
// a paused or expired campaign does nothing, a patient cannot claim their own
// invite, an invite is claimable exactly once and only before a first paid
// session, and every admin route behind these is scope-guarded.
import { test, expect, request as playwrightRequest } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BASE, QA_EMAILS, adminClient, cookieHeaderFor, profileIdFor } from "./helpers";

const CATEGORY_TITLE = "QA Promo Condition";
const CATEGORY_PRICE_PAISE = 120000; // ₹1,200
const CODE_PREFIX = "QAPROMO";

test.describe("Promo codes and invites", () => {
  let admin: SupabaseClient;
  let patientId = "";
  let patientBId = "";
  let categoryId = "";
  const seededCodes: string[] = [];

  function futureSlot(daysAhead: number, hour: number): string {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  }

  async function freshBooking(forPatientId: string, daysAhead = 4, hour = 12): Promise<string> {
    const { data } = await admin
      .from("appointments")
      .insert({
        patient_id: forPatientId,
        category_id: categoryId,
        concern: CATEGORY_TITLE,
        slot_time: futureSlot(daysAhead, hour),
        duration_minutes: 45,
        status: "requested",
        payment_status: "unpaid",
        visit_mode: "online",
      })
      .select("id")
      .single();
    expect(data?.id, "seeded booking").toBeTruthy();
    return data!.id as string;
  }

  /** A campaign, created straight through the table so a spec that is about
   *  claiming does not depend on the admin route it is not testing. */
  async function seedCode(
    suffix: string,
    over: Record<string, unknown> = {}
  ): Promise<{ id: string; code: string }> {
    const code = `${CODE_PREFIX}${suffix}`;
    await admin.from("promo_codes").delete().eq("code", code);
    const { data, error } = await admin
      .from("promo_codes")
      .insert({ code, kind: "amount_off", value: 20000, active: true, ...over })
      .select("id")
      .single();
    expect(error, `seeding ${code}: ${error?.message ?? ""}`).toBeNull();
    seededCodes.push(code);
    return { id: data!.id as string, code };
  }

  test.beforeAll(async () => {
    admin = adminClient();
    patientId = await profileIdFor(admin, QA_EMAILS.patientA);
    patientBId = await profileIdFor(admin, QA_EMAILS.patientB);

    const { data: category } = await admin
      .from("treatment_categories")
      .select("id")
      .eq("title", CATEGORY_TITLE)
      .limit(1)
      .maybeSingle();
    categoryId =
      category?.id ??
      (
        await admin
          .from("treatment_categories")
          .insert({
            title: CATEGORY_TITLE,
            points: [],
            price_paise: CATEGORY_PRICE_PAISE,
            duration_minutes: 45,
            active: true,
          })
          .select("id")
          .single()
      ).data?.id ??
      "";
    expect(categoryId, "seeded category").not.toBe("");

    await admin.from("site_settings").update({ promo_codes_enabled: true }).not("id", "is", null);
  });

  test.afterAll(async () => {
    if (!admin) return;
    await admin
      .from("site_settings")
      .update({ promo_codes_enabled: false, invite_rewards_enabled: false })
      .not("id", "is", null);
    // Unpaid bookings left behind become "Payment not completed" feed items
    // on a real fixture patient's dashboard, which is noise for the next run
    // and how one spec makes another fail on a working feature.
    await admin
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("concern", CATEGORY_TITLE)
      .neq("status", "cancelled");
    // Invites this spec caused, from either end.
    await admin.from("patient_invites").delete().in("invitee_id", [patientId, patientBId]);
    await admin.from("patient_invites").delete().in("inviter_id", [patientId, patientBId]);
    for (const code of seededCodes) {
      const { data: promo } = await admin
        .from("promo_codes")
        .select("id")
        .eq("code", code)
        .maybeSingle();
      if (!promo) continue;
      await admin
        .from("appointments")
        .update({ promo_code_id: null, promo_claimed_at: null })
        .eq("promo_code_id", promo.id);
      await admin.from("promo_codes").delete().eq("id", promo.id);
    }
  });

  // ---------------------------------------------------------------- promo

  test("PRC-001: only a money admin may create or delete a campaign", async ({ request }) => {
    const payload = { code: "QAPROMOAUTHZ", kind: "amount_off", value: 10000 };

    const anon = await request.post(`${BASE}/api/admin/save-promo-code`, {
      headers: { "content-type": "application/json" },
      data: payload,
    });
    expect(anon.status(), "anonymous").toBe(403);

    for (const who of [QA_EMAILS.patientA, QA_EMAILS.therapistA, QA_EMAILS.hospital]) {
      const res = await request.post(`${BASE}/api/admin/save-promo-code`, {
        headers: { cookie: await cookieHeaderFor(who), "content-type": "application/json" },
        data: payload,
      });
      expect(res.status(), who).toBe(403);

      const del = await request.post(`${BASE}/api/admin/delete-promo-code`, {
        headers: { cookie: await cookieHeaderFor(who), "content-type": "application/json" },
        data: { id: "00000000-0000-0000-0000-000000000000" },
      });
      expect(del.status(), `${who} delete`).toBe(403);
    }

    // And nothing was created by any of that.
    const { count } = await admin
      .from("promo_codes")
      .select("id", { count: "exact", head: true })
      .eq("code", "QAPROMOAUTHZ");
    expect(count ?? 0).toBe(0);
  });

  test("PRC-002: a campaign is validated before it is stored", async () => {
    const ctx = await playwrightRequest.newContext({
      extraHTTPHeaders: { cookie: await cookieHeaderFor(QA_EMAILS.admin) },
    });

    const punctuated = await ctx.post(`${BASE}/api/admin/save-promo-code`, {
      data: { code: "QA-PROMO", kind: "amount_off", value: 10000 },
    });
    expect(punctuated.status(), await punctuated.text()).toBe(400);

    const overHundred = await ctx.post(`${BASE}/api/admin/save-promo-code`, {
      data: { code: "QAPROMOPCT", kind: "percent_off", value: 150 },
    });
    expect(overHundred.status(), await overHundred.text()).toBe(400);

    const backwards = await ctx.post(`${BASE}/api/admin/save-promo-code`, {
      data: {
        code: "QAPROMOWINDOW",
        kind: "amount_off",
        value: 10000,
        startsAt: futureSlot(10, 9),
        endsAt: futureSlot(2, 9),
      },
    });
    expect(backwards.status(), await backwards.text()).toBe(400);

    await ctx.dispose();
  });

  test("PRC-003: a running code quotes what it takes off, and the browser sends no amount", async () => {
    const { code } = await seedCode("LIVE");
    const appointmentId = await freshBooking(patientId);
    const ctx = await playwrightRequest.newContext({
      extraHTTPHeaders: { cookie: await cookieHeaderFor(QA_EMAILS.patientA) },
    });

    const preview = await ctx.post(`${BASE}/api/patient/promo-code/preview`, {
      data: { appointmentId, code: code.toLowerCase() },
    });
    expect(preview.ok(), await preview.text()).toBeTruthy();
    const body = await preview.json();
    expect(body.applies, JSON.stringify(body)).toBe(true);
    // The figure comes back from the server -- the request carried a name.
    expect(body.discountPaise).toBe(20000);
    expect(body.payablePaise).toBe(CATEGORY_PRICE_PAISE - 20000);

    await ctx.dispose();
  });

  test("PRC-004: a paused or expired campaign does nothing, and says which", async () => {
    const paused = await seedCode("PAUSED", { active: false });
    const expired = await seedCode("EXPIRED", {
      ends_at: new Date(Date.now() - 60_000).toISOString(),
    });
    const appointmentId = await freshBooking(patientId);
    const ctx = await playwrightRequest.newContext({
      extraHTTPHeaders: { cookie: await cookieHeaderFor(QA_EMAILS.patientA) },
    });

    for (const [label, code, phrase] of [
      ["paused", paused.code, "no longer available"],
      ["expired", expired.code, "expired"],
    ] as const) {
      const res = await ctx.post(`${BASE}/api/patient/promo-code/preview`, {
        data: { appointmentId, code },
      });
      const body = await res.json();
      expect(body.applies, label).toBe(false);
      // A refusal a patient can act on, not "that code isn't valid".
      expect(String(body.message).toLowerCase(), label).toContain(phrase);
    }

    await ctx.dispose();
  });

  test("PRC-005: a redemption cap holds -- the second claim is refused", async () => {
    const { id, code } = await seedCode("CAPPED", { max_redemptions: 1, max_per_patient: 5 });
    const first = await freshBooking(patientId);
    const second = await freshBooking(patientId, 5, 12);

    // The claim, not the preview, is the authority: it opens with a row lock
    // so two checkouts cannot both read a cap that has room for one.
    const claimOne = await admin.rpc("claim_promo_code", {
      p_code: code,
      p_patient_id: patientId,
      p_appointment_id: first,
      p_patient_has_paid_before: false,
    });
    expect(claimOne.error?.message ?? "", "first claim").toBe("");
    expect(claimOne.data?.ok, JSON.stringify(claimOne.data)).toBe(true);

    // Paid, so the first claim counts for good rather than ageing out.
    await admin.from("appointments").update({ payment_status: "paid" }).eq("id", first);

    const claimTwo = await admin.rpc("claim_promo_code", {
      p_code: code,
      p_patient_id: patientId,
      p_appointment_id: second,
      p_patient_has_paid_before: true,
    });
    expect(claimTwo.data?.ok, JSON.stringify(claimTwo.data)).toBe(false);
    expect(claimTwo.data?.reason).toBe("exhausted");

    // And the losing booking carries no claim, so nothing counts against the
    // cap for a discount that was never given.
    const { data: row } = await admin
      .from("appointments")
      .select("promo_code_id")
      .eq("id", second)
      .single();
    expect(row?.promo_code_id ?? null).toBeNull();

    // Cleanup: this spec deliberately marked a booking paid.
    await admin
      .from("appointments")
      .update({ payment_status: "unpaid", promo_code_id: null, promo_claimed_at: null })
      .eq("id", first);
    await admin.from("promo_codes").delete().eq("id", id);
  });

  test("PRC-006: with codes switched off there is nothing to claim", async () => {
    const { code } = await seedCode("SWITCHED");
    const appointmentId = await freshBooking(patientId);
    await admin.from("site_settings").update({ promo_codes_enabled: false }).not("id", "is", null);
    const ctx = await playwrightRequest.newContext({
      extraHTTPHeaders: { cookie: await cookieHeaderFor(QA_EMAILS.patientA) },
    });
    try {
      const res = await ctx.post(`${BASE}/api/patient/promo-code/preview`, {
        data: { appointmentId, code },
      });
      const body = await res.json();
      expect(body.applies, JSON.stringify(body)).toBe(false);
    } finally {
      await admin.from("site_settings").update({ promo_codes_enabled: true }).not("id", "is", null);
      await ctx.dispose();
    }
  });

  test("PRC-007: a promo code is not a way for a clinician to reach checkout", async ({
    request,
  }) => {
    const { code } = await seedCode("ROLE");
    const appointmentId = await freshBooking(patientId);
    for (const who of [QA_EMAILS.therapistA, QA_EMAILS.hospital]) {
      const res = await request.post(`${BASE}/api/patient/promo-code/preview`, {
        headers: { cookie: await cookieHeaderFor(who), "content-type": "application/json" },
        data: { appointmentId, code },
      });
      expect(res.status(), who).toBe(403);
    }
  });

  // --------------------------------------------------------------- invites

  test("INV-001: nothing can be claimed while invites are off", async ({ request }) => {
    await admin
      .from("site_settings")
      .update({ invite_rewards_enabled: false })
      .not("id", "is", null);
    const code = await inviteCodeFor(patientId);
    const res = await request.post(`${BASE}/api/patient/invite/claim`, {
      headers: { cookie: await cookieHeaderFor(QA_EMAILS.patientB), "content-type": "application/json" },
      data: { code },
    });
    const body = await res.json();
    expect(body.claimed, JSON.stringify(body)).toBe(false);
  });

  test("INV-002: a patient cannot claim their own code", async ({ request }) => {
    await setInvites(true);
    const code = await inviteCodeFor(patientId);
    const res = await request.post(`${BASE}/api/patient/invite/claim`, {
      headers: { cookie: await cookieHeaderFor(QA_EMAILS.patientA), "content-type": "application/json" },
      data: { code },
    });
    const body = await res.json();
    expect(body.claimed, JSON.stringify(body)).toBe(false);
    expect(String(body.message).toLowerCase()).toContain("your own");
  });

  test("INV-003: an established patient is not new, so cannot be invited", async ({ request }) => {
    await setInvites(true);
    // A patient is new exactly once, the same test the first-session offer
    // uses. The paid booking is seeded rather than assumed: whether a
    // fixture patient happens to have paid for something is another spec's
    // business, and a rule this load-bearing should not be asserted against
    // a state this file did not set.
    await admin.from("patient_invites").delete().eq("invitee_id", patientId);
    const paidId = await freshBooking(patientId, 6, 12);
    await admin
      .from("appointments")
      .update({ payment_status: "paid", amount_paid_paise: CATEGORY_PRICE_PAISE })
      .eq("id", paidId);

    try {
      const code = await inviteCodeFor(patientBId);
      const res = await request.post(`${BASE}/api/patient/invite/claim`, {
        headers: {
          cookie: await cookieHeaderFor(QA_EMAILS.patientA),
          "content-type": "application/json",
        },
        data: { code },
      });
      const body = await res.json();
      expect(body.claimed, JSON.stringify(body)).toBe(false);
      expect(String(body.message).toLowerCase()).toContain("before your first session");

      // ...and nothing was written.
      const { count } = await admin
        .from("patient_invites")
        .select("id", { count: "exact", head: true })
        .eq("invitee_id", patientId);
      expect(count ?? 0).toBe(0);
    } finally {
      await admin
        .from("appointments")
        .update({ payment_status: "unpaid", amount_paid_paise: null, status: "cancelled" })
        .eq("id", paidId);
    }
  });

  test("INV-004: an invite code belongs to one patient and is stable", async () => {
    const first = await inviteCodeFor(patientId);
    const again = await inviteCodeFor(patientId);
    expect(again, "a code does not change under the patient").toBe(first);

    const other = await inviteCodeFor(patientBId);
    expect(other).not.toBe(first);
  });

  test("INV-005: only a patient account may claim an invite", async ({ request }) => {
    await setInvites(true);
    const code = await inviteCodeFor(patientId);
    for (const who of [QA_EMAILS.therapistA, QA_EMAILS.hospital]) {
      const res = await request.post(`${BASE}/api/patient/invite/claim`, {
        headers: { cookie: await cookieHeaderFor(who), "content-type": "application/json" },
        data: { code },
      });
      expect(res.status(), who).toBe(403);
    }
    const anon = await request.post(`${BASE}/api/patient/invite/claim`, {
      headers: { "content-type": "application/json" },
      data: { code },
    });
    expect(anon.status(), "anonymous").toBe(401);
  });

  async function setInvites(enabled: boolean) {
    await admin
      .from("site_settings")
      .update({
        invite_rewards_enabled: enabled,
        invite_reward_paise: 20000,
        invite_welcome_paise: 30000,
        invite_max_rewards_per_patient: 10,
      })
      .not("id", "is", null);
  }

  /** The code a patient's own dashboard would mint for them. */
  async function inviteCodeFor(profileId: string): Promise<string> {
    const { data: existing } = await admin
      .from("profiles")
      .select("invite_code")
      .eq("id", profileId)
      .single();
    if (existing?.invite_code) return existing.invite_code as string;
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let candidate = "";
    for (let i = 0; i < 8; i += 1) {
      candidate += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    const { data } = await admin.rpc("ensure_invite_code", {
      p_profile_id: profileId,
      p_candidate: candidate,
    });
    expect(data, "minted invite code").toBeTruthy();
    return data as string;
  }
});

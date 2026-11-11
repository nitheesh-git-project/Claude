// Test accounts made from the debug bar.
//
// Testing any feature needs a patient, a therapist, a hospital and an admin
// of each desk, and making them by hand was the slowest part of a test. The
// debug bar's Test accounts panel makes one of each in a tap
// (src/app/api/admin/debug-test-accounts) and shows their sign-ins with
// copy buttons. Deleting removes the account and everything it did --
// payments included -- through `debug_purge_test_account()`, which refuses
// any id the panel did not create.
//
// Dependency-free, so what a set contains and how its logins look are
// tested without a database.

export type TestAccountRole = "patient" | "therapist" | "hospital" | "admin";
export type TestAdminScope = "operations" | "finance" | "clinical";

export type TestAccountPlan = {
  key: string;
  role: TestAccountRole;
  adminScope: TestAdminScope | null;
  /** What the panel calls it: "Patient", "Finance admin". */
  label: string;
};

/** One set, in the order the panel lists it. Never a Master Admin: a test
 *  login with full scope is a login that can reset the database. */
export const TEST_ACCOUNT_SET: TestAccountPlan[] = [
  { key: "patient", role: "patient", adminScope: null, label: "Patient" },
  { key: "therapist", role: "therapist", adminScope: null, label: "Therapist" },
  { key: "hospital", role: "hospital", adminScope: null, label: "Hospital partner" },
  { key: "ops", role: "admin", adminScope: "operations", label: "Operations admin" },
  { key: "finance", role: "admin", adminScope: "finance", label: "Finance admin" },
  { key: "clinical", role: "admin", adminScope: "clinical", label: "Clinical admin" },
];

/** The domain every test login uses. `.test` is reserved (RFC 2606), so no
 *  mail is ever delivered to one. */
export const TEST_EMAIL_DOMAIN = "moverestore.test";

/** A short lowercase tag that tells one set from another: "k7q2m". */
export function batchTag(random: () => number): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 5; i++) out += alphabet[Math.floor(random() * alphabet.length) % alphabet.length];
  return out;
}

export function testAccountEmail(plan: TestAccountPlan, tag: string): string {
  return `test.${plan.key}.${tag}@${TEST_EMAIL_DOMAIN}`;
}

export function testAccountName(plan: TestAccountPlan, tag: string): string {
  return `Test ${plan.label} ${tag.toUpperCase()}`;
}

/**
 * A password that is easy to read aloud and paste, and still passes any
 * reasonable strength rule: a capital, lower case, digits and a symbol.
 * "Test-K7Q2M-4821".
 */
export function testAccountPassword(tag: string, random: () => number): string {
  const digits = String(1000 + Math.floor(random() * 9000)).slice(0, 4);
  return `Test-${tag.toUpperCase()}-${digits}`;
}

/** Which login page a role signs in on. Admins share one. */
export function testAccountLoginPath(role: TestAccountRole): string {
  switch (role) {
    case "patient":
      return "/patient/login";
    case "therapist":
      return "/therapist/login";
    case "hospital":
      return "/hospital/login";
    case "admin":
      return "/admin/login";
  }
}

/** Email and password on two lines -- what "Copy both" puts on the clipboard. */
export function credentialsText(email: string, password: string): string {
  return `${email}\n${password}`;
}

export type TestAccountRow = {
  user_id: string;
  batch_id: string;
  role: TestAccountRole;
  admin_scope: TestAdminScope | null;
  label: string;
  email: string;
  password: string;
  created_at: string;
};

/** Newest set first, and within a set the panel's own order. */
export function groupTestAccounts(rows: TestAccountRow[]): { batchId: string; createdAt: string; accounts: TestAccountRow[] }[] {
  const order = new Map(TEST_ACCOUNT_SET.map((p, i) => [p.label, i]));
  const byBatch = new Map<string, TestAccountRow[]>();
  for (const row of rows) {
    const list = byBatch.get(row.batch_id) ?? [];
    list.push(row);
    byBatch.set(row.batch_id, list);
  }
  return [...byBatch.entries()]
    .map(([batchId, accounts]) => ({
      batchId,
      createdAt: accounts.reduce((min, a) => (a.created_at < min ? a.created_at : min), accounts[0].created_at),
      accounts: [...accounts].sort((a, b) => (order.get(a.label) ?? 99) - (order.get(b.label) ?? 99)),
    }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

// ---------------------------------------------------------------------------
// The test card
// ---------------------------------------------------------------------------
//
// Razorpay's test Mastercard, which succeeds in test mode. Razorpay's card
// form is inside its own secure frame on another origin, and no page is
// allowed to type into that -- so the panel offers each value with a copy
// button instead, and a small box floats over the checkout while it is open.

export const TEST_CARD = {
  number: "5267 3181 8797 5449",
  expiry: "12/29",
  cvv: "123",
  otp: "1111",
} as const;

export const TEST_CARD_FIELDS: { key: keyof typeof TEST_CARD; label: string; copy: string }[] = [
  { key: "number", label: "Card number", copy: TEST_CARD.number.replace(/\s/g, "") },
  { key: "expiry", label: "Expiry", copy: TEST_CARD.expiry },
  { key: "cvv", label: "CVV", copy: TEST_CARD.cvv },
  { key: "otp", label: "OTP", copy: TEST_CARD.otp },
];

/** Every value on one line each, for "Copy all". */
export function testCardText(): string {
  return `Card ${TEST_CARD.number}\nExpiry ${TEST_CARD.expiry}\nCVV ${TEST_CARD.cvv}\nOTP ${TEST_CARD.otp}`;
}

/** The test card only works against a test key; on a live key it would be a
 *  declined real charge attempt, so the box is not shown at all. */
export function isRazorpayTestKey(keyId: string | null | undefined): boolean {
  return typeof keyId === "string" && keyId.startsWith("rzp_test_");
}

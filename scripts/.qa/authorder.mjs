const BASE = "http://localhost:3000";
const UUID = "11111111-1111-4111-8111-111111111111";
const CASES = [
  ["/api/appointments/cancel", { appointmentId: UUID }],
  ["/api/appointments/complete-session", { appointmentId: UUID }],
  ["/api/patient/condition-profile/submit", { data: { chief_complaint: "x" } }],
  ["/api/patient/respond-suggestion", { suggestionId: UUID, answer: "accept" }],
  ["/api/therapist/save-availability", { days: [] }],
  ["/api/medical-documents/view", { documentId: UUID }],
  ["/api/razorpay/create-order", { appointmentId: UUID }],
  ["/api/razorpay/verify", { appointmentId: UUID, razorpay_order_id: "o", razorpay_payment_id: "p", razorpay_signature: "s" }],
  ["/api/care-plan/create-order", { carePlanVersionId: UUID }],
  ["/api/home-visit/create-order", { packageId: UUID, pincode: "560038" }],
  ["/api/home-visit/book-cash", { packageId: UUID, pincode: "560038" }],
];
let unauth = 0;
for (const [route, body] of CASES) {
  const res = await fetch(BASE + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const text = (await res.text()).slice(0, 80);
  const refused = res.status === 401 || res.status === 403;
  if (refused) unauth++;
  console.log(`${refused ? "PASS" : "FAIL"}  ${String(res.status).padEnd(4)} ${route.padEnd(46)} ${text}`);
}
console.log(`\n${unauth}/${CASES.length} refuse an anonymous caller once the body is well-formed`);

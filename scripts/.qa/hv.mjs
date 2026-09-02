const BASE="http://localhost:3000";
const body = { packageId:"11111111-1111-4111-8111-111111111111", pincode:"560038",
  address:{ line1:"12, 3rd Cross, Indiranagar", line2:"Near Metro", city:"Bengaluru", state:"Karnataka", pincode:"560038" },
  addressLine1:"12, 3rd Cross, Indiranagar", city:"Bengaluru", state:"Karnataka",
  slots:[{ slotDateTime:new Date(Date.now()+7*864e5).toISOString() }] };
for (const r of ["/api/home-visit/create-order","/api/home-visit/book-cash"]) {
  const res = await fetch(BASE+r,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  console.log(`${r} -> ${res.status} ${(await res.text()).slice(0,110)}`);
}

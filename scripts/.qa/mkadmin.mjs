import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, key, { auth: { persistSession: false } });
const EMAIL = "qa.admin@example.test", PASS = "QaTest!2024pass";

const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
let user = list.users.find((u) => u.email === EMAIL);
if (!user) {
  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL, password: PASS, email_confirm: true,
    user_metadata: { full_name: "QA Admin", role: "admin" },
  });
  if (error) throw error;
  user = data.user;
  console.log("created", user.id);
} else {
  await admin.auth.admin.updateUserById(user.id, { password: PASS });
  console.log("reset password for existing", user.id);
}
const { error: pe } = await admin.from("profiles")
  .update({ role: "admin", admin_scope: "full", active: true, approved: true, full_name: "QA Admin" })
  .eq("id", user.id);
if (pe) console.log("profile update error:", pe.message);
const { data: prof } = await admin.from("profiles").select("role, admin_scope, active").eq("id", user.id).single();
console.log("profile:", JSON.stringify(prof));

"use server";

import { redirect } from "next/navigation";
import { ROLES, type UserRole } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/supabase/profile";

export async function completeRole(formData: FormData) {
  const role = String(formData.get("role") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));
  const allowed = ROLES.some((item) => item.value === role);
  if (!allowed) redirect(`/onboarding/role?next=${encodeURIComponent(next)}&error=role`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/onboarding/role?next=${encodeURIComponent(next)}`)}`);

  const { error } = await supabase
    .from("profiles")
    .update({ role: role as UserRole })
    .eq("id", user.id);
  if (error) redirect(`/onboarding/role?next=${encodeURIComponent(next)}&error=save`);
  redirect(next);
}

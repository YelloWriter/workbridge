import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function requireMember(next: string) {
  // Supabase auth starts time-dependent session work during construction.
  // Keep that work entirely outside Next.js prerendering.
  await connection();
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect(`/login?next=${encodeURIComponent(next)}`);
  const { data: active, error: activeError } = await supabase.rpc("application_member_is_active");
  if (activeError) throw new Error("회원 상태를 확인하지 못했습니다. DB 설정을 확인해 주세요.");
  if (!active) redirect(`/login?next=${encodeURIComponent(next)}`);
  const { data: profile, error: profileError } = await supabase.from("profiles")
    .select("id, role, name, bio, category, skills").eq("id", user.id).maybeSingle();
  if (profileError) throw new Error("프로필을 불러오지 못했습니다. DB 설정을 확인해 주세요.");
  if (!profile) redirect(`/me/profile?next=${encodeURIComponent(next)}`);
  if (!profile.role) redirect(`/onboarding/role?next=${encodeURIComponent(next)}`);
  return { supabase, user, profile, now: Date.now() };
}

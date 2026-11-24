import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function requireMember(next: string) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect(`/login?next=${encodeURIComponent(next)}`);
  const { data: profile, error: profileError } = await supabase.from("profiles")
    .select("id, role, name, bio, category, skills").eq("id", user.id).maybeSingle();
  if (profileError) throw new Error("프로필을 불러오지 못했습니다. DB 설정을 확인해 주세요.");
  if (!profile) redirect(`/me/profile?next=${encodeURIComponent(next)}`);
  return { supabase, user, profile, now: Date.now() };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRole } from "@/lib/constants";

export const PUBLIC_PROFILE_COLUMNS =
  "id, role, name, avatar_url, bio, company_name, business_field, website, category, skills, career_years, hourly_rate, portfolio_url";

export type Profile = {
  id: string;
  role: UserRole | null;
  name: string | null;
  avatar_url: string | null;
  bio: string | null;
  company_name: string | null;
  business_field: string | null;
  website: string | null;
  category: string | null;
  skills: string[] | null;
  career_years: number | null;
  hourly_rate: number | null;
  portfolio_url: string | null;
};

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function safeNext(value: string | null | undefined, fallback = "/") {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (value.includes("\\") || value.includes("://")) return fallback;
  return value;
}

export async function pathAfterLogin(supabase: SupabaseClient, nextValue: string | null) {
  const next = safeNext(nextValue);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return next;

  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!data?.role) return `/onboarding/role?next=${encodeURIComponent(next)}`;
  return next;
}

export function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function blankToNull(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

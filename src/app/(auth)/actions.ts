"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, pathAfterLogin, safeNext } from "@/lib/supabase/profile";

export type AuthState = { message: string } | null;

async function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

function signupMessage(raw: string) {
  const text = raw.toLowerCase();
  if (text.includes("already")) {
    return "이미 가입된 이메일입니다. 로그인해 주세요. 구글로 먼저 가입했다면 구글로 로그인해 주세요.";
  }
  if (text.includes("rate limit")) {
    return "가입 메일을 너무 자주 보내 잠시 막혀 있습니다. Supabase에서 이메일 인증을 끄면 메일 없이 바로 가입됩니다.";
  }
  if (text.includes("invalid")) return "사용할 수 없는 이메일입니다. 받을 수 있는 메일 주소를 적어 주세요.";
  if (text.includes("password")) return "비밀번호는 8자 이상이어야 합니다.";
  return "회원가입에 실패했습니다. 입력한 내용을 다시 확인해 주세요.";
}

export async function signUp(_state: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured()) return { message: "Supabase 연결 정보가 아직 없습니다." };

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));

  if (!email.includes("@")) return { message: "이메일 형식을 확인해 주세요." };
  if (password.length < 8) return { message: "비밀번호는 8자 이상이어야 합니다." };
  if (password !== confirm) return { message: "비밀번호 확인이 비밀번호와 다릅니다." };

  const supabase = await createClient();
  const origin = await siteUrl();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });

  if (error) return { message: signupMessage(error.message) };
  if (!data.session) {
    return { message: "가입 메일을 확인해 주세요. 이번 주 시연에서는 메일 인증을 꺼 두는 것이 좋습니다." };
  }

  redirect(await pathAfterLogin(supabase, next));
}

export async function signIn(_state: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured()) return { message: "Supabase 연결 정보가 아직 없습니다." };

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { message: "이메일 또는 비밀번호가 맞지 않습니다." };
  redirect(await pathAfterLogin(supabase, next));
}

export async function signInWithGoogle(formData: FormData) {
  if (!isSupabaseConfigured()) return;
  const next = safeNext(String(formData.get("next") ?? ""));
  const origin = await siteUrl();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });

  if (error || !data.url) {
    redirect("/login?error=google");
  }
  redirect(data.url);
}

export async function signOut() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}

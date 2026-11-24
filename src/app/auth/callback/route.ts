import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pathAfterLogin, safeNext } from "@/lib/supabase/profile";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  const login = new URL("/login", url.origin);
  login.searchParams.set("error", "google");

  if (!code) return NextResponse.redirect(login);

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(login);

  const destination = await pathAfterLogin(supabase, next);
  return NextResponse.redirect(new URL(destination, url.origin));
}

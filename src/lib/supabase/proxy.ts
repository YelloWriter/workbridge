// 요청마다 Supabase 세션을 갱신한다. (src/proxy.ts에서 호출)
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/supabase/profile";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return response; // 환경 변수를 넣기 전에도 화면은 뜨게 한다.
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // 세션 자동 갱신. 이 호출과 response 사이에 다른 코드를 넣지 않는다.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (user && (path === "/login" || path === "/signup")) {
    const next = safeNext(request.nextUrl.searchParams.get("next"));
    const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const destination = data?.role ? next : `/onboarding/role?next=${encodeURIComponent(next)}`;
    const redirectResponse = NextResponse.redirect(new URL(destination, request.url));
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  return response;
}

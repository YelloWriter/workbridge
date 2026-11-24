"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { signOut } from "@/app/(auth)/actions";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/constants";

type SessionState = { status: "out" } | { status: "in"; role: UserRole | null };

export function Header() {
  const [session, setSession] = useState<SessionState>({ status: "out" });

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      setSession({ status: "out" });
      return;
    }
    const supabase = createClient();
    let ignore = false;
    supabase.auth.getUser().then(async ({ data }) => {
      if (ignore) return;
      if (!data.user) {
        setSession({ status: "out" });
        return;
      }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
      if (!ignore) setSession({ status: "in", role: (profile?.role as UserRole | null) ?? null });
    });
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-4 px-4">
        <Link href="/" className="text-lg font-semibold tracking-tight text-slate-900">
          WorkBridge
        </Link>
        {session.status === "in" ? <LoggedInLinks role={session.role} /> : <LoggedOutLinks />}
      </div>
    </header>
  );
}

function LoggedInLinks({ role }: { role: UserRole | null }) {
  return (
    <nav className="flex items-center gap-3 text-sm text-slate-700">
      <Link href="/me/profile" className="hover:text-slate-950">
        내 프로필
      </Link>
      {role === "client" && (
        <Link href="/me/projects" className="hover:text-slate-950">
          내 프로젝트
        </Link>
      )}
      {role === "freelancer" && (
        <>
          <Link href="/me/applications" className="hover:text-slate-950">
            내 지원 현황
          </Link>
          <Link href="/me/bookmarks" className="hover:text-slate-950">
            북마크
          </Link>
        </>
      )}
      {role && (
        // 3번 담당: 알림 아이콘 컴포넌트를 이 자리에 넣어 주세요.
        <div data-slot="header-notifications" aria-label="알림" />
      )}
      <form action={signOut}>
        <button type="submit" className="hover:text-slate-950">
          로그아웃
        </button>
      </form>
    </nav>
  );
}

function LoggedOutLinks() {
  return (
    <nav className="flex items-center gap-3 text-sm">
      <Link href="/signup" className="text-slate-700 hover:text-slate-950">
        회원가입
      </Link>
      <Link href="/login" className="rounded-lg bg-slate-900 px-3 py-2 text-white hover:bg-slate-700">
        로그인
      </Link>
    </nav>
  );
}

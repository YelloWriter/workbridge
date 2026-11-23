import Link from "next/link";
import type { ReactNode } from "react";

export function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <main className="mx-auto w-full max-w-4xl px-5 py-10 sm:py-16">
    <nav aria-label="지원 메뉴" className="mb-10 flex flex-wrap gap-5 text-sm text-slate-600">
      <Link href="/projects">프로젝트 찾기</Link><Link href="/me/applications">내 지원 현황</Link><Link href="/notifications">알림</Link>
    </nav>
    <p className="mb-2 text-sm font-semibold text-teal-700">WorkBridge</p>
    <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
    <p className="mt-3 mb-8 text-slate-600">{description}</p>
    {children}
  </main>;
}
export function Notice({ children }: { children: ReactNode }) {
  return <p role="status" className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm leading-7 text-slate-700">{children}</p>;
}
export function SetupNotice() {
  return <Notice>서비스 연결을 준비하고 있습니다. Supabase 연결 정보와 팀 공용 DB가 준비되면 이용할 수 있습니다.</Notice>;
}
export const inputClass = "mt-2 w-full rounded-lg border border-slate-300 bg-background p-3 focus:outline-2 focus:outline-teal-600";
export const buttonClass = "rounded-lg bg-teal-800 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-900 disabled:cursor-wait disabled:opacity-50";

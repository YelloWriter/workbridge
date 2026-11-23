"use client";
import Link from "next/link";
export function RetryError({ reset }: { reset: () => void }) {
  return <main className="mx-auto w-full max-w-4xl px-5 py-16">
    <h1 className="text-2xl font-bold">정보를 불러오지 못했습니다</h1>
    <p role="alert" className="my-5 text-slate-600">잠시 후 다시 시도해 주세요. 문제가 계속되면 관리자에게 알려 주세요.</p>
    <button className="rounded-lg bg-teal-800 px-5 py-3 text-sm text-white" onClick={reset}>다시 시도</button>
    <Link href="/" className="ml-5 text-sm underline">홈으로 이동</Link>
  </main>;
}

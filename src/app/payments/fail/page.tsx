import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { markPaymentFailed } from "@/app/payments/actions";

export default function FailPage({ searchParams }: { searchParams: Promise<{ orderId?: string; code?: string; saved?: string }> }) {
  return (
    <Suspense fallback={<p className="p-8 text-center">결제 실패를 기록하고 있습니다.</p>}>
      <FailContent searchParams={searchParams} />
    </Suspense>
  );
}

async function FailContent({ searchParams }: { searchParams: Promise<{ orderId?: string; code?: string; saved?: string }> }) {
  await connection();
  const params = await searchParams;
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-2xl font-semibold">결제가 완료되지 않았습니다</h1>
      <p className="mt-4 text-sm text-slate-700">{params.saved ? "다시 결제할 수 있습니다." : "결제창을 닫았거나 승인이 거절되었습니다."}</p>
      {params.code && <p className="mt-2 text-xs text-slate-500">코드 {params.code}</p>}
      {params.orderId && !params.saved && (
        <form action={markPaymentFailed.bind(null, params.orderId)} className="mt-6">
          <button className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white">실패로 기록하고 다시 준비하기</button>
        </form>
      )}
      <Link href="/payments/history" className="mt-6 inline-block text-sm underline">내 결제 내역</Link>
    </main>
  );
}

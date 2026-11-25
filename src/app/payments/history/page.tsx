import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

const STATUS_LABEL: Record<string, string> = {
  ready: "결제 대기",
  paid: "에스크로 보관",
  paid_out: "정산 완료",
  failed: "실패",
  refunded: "환불",
};

export default function HistoryPage() {
  return (
    <Suspense fallback={<p className="p-8 text-center">결제 내역을 준비하고 있습니다.</p>}>
      <HistoryContent />
    </Suspense>
  );
}

async function HistoryContent() {
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <p className="mx-auto max-w-xl p-8">로그인한 뒤 다시 열어 주세요.</p>;

  const { data: payments, error } = await supabase
    .from("payments")
    .select("id, contract_id, order_id, amount, fee_amount, payout_amount, status, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) return <p className="mx-auto max-w-xl p-8">결제 내역을 불러오지 못했습니다.</p>;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold">내 결제 내역</h1>
      <ul className="mt-6 space-y-3">
        {(payments ?? []).length === 0 && <li className="text-sm text-slate-500">아직 결제가 없습니다.</li>}
        {(payments ?? []).map((payment) => (
          <li key={payment.id} className="rounded-lg border border-slate-200 p-4 text-sm">
            <Link href={`/payments/${payment.contract_id}`} className="font-medium underline">{payment.order_id}</Link>
            <p className="mt-1">{STATUS_LABEL[payment.status] ?? payment.status} · {Number(payment.amount).toLocaleString("ko-KR")}원</p>
            <p className="text-slate-500">수수료 {Number(payment.fee_amount).toLocaleString("ko-KR")}원 · 정산 {Number(payment.payout_amount).toLocaleString("ko-KR")}원</p>
          </li>
        ))}
      </ul>
    </main>
  );
}

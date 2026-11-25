import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { DeliveryActions } from "@/components/payments/delivery-actions";
import { PayButton } from "@/components/payments/pay-button";
import { startPayment } from "@/app/payments/actions";
import { createClient } from "@/lib/supabase/server";

const STATUS_LABEL: Record<string, string> = {
  ready: "결제 대기",
  paid: "에스크로 보관",
  paid_out: "정산 완료",
  failed: "실패",
  refunded: "환불",
};

function won(value: number) {
  return `${Number(value).toLocaleString("ko-KR")}원`;
}

export default function PaymentPage({ params }: { params: Promise<{ contractId: string }> }) {
  return (
    <Suspense fallback={<p className="p-8 text-center text-slate-500">결제를 준비하고 있습니다.</p>}>
      <PaymentContent params={params} />
    </Suspense>
  );
}

async function PaymentContent({ params }: { params: Promise<{ contractId: string }> }) {
  await connection();
  const { contractId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return <p className="mx-auto max-w-xl p-8">로그인한 뒤 다시 열어 주세요.</p>;
  }

  const { data: contract, error } = await supabase
    .from("contracts")
    .select("id, client_id, freelancer_id, agreed_amount, status, project_id")
    .eq("id", contractId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !contract) {
    return <p className="mx-auto max-w-xl p-8">이 계약을 볼 수 없습니다.</p>;
  }

  const [{ data: project }, { data: payments }] = await Promise.all([
    supabase.from("projects").select("title, status").eq("id", contract.project_id).maybeSingle(),
    supabase.from("payments").select("id, order_id, amount, fee_amount, payout_amount, status").eq("contract_id", contractId).is("deleted_at", null).order("created_at", { ascending: false }),
  ]);
  const payment = (payments ?? []).find((item) => ["ready", "paid", "paid_out"].includes(item.status)) ?? payments?.[0] ?? null;
  const role = user.id === contract.client_id ? "client" : "freelancer";
  const amount = Number(payment?.amount ?? contract.agreed_amount);
  const fee = payment ? Number(payment.fee_amount) : Math.floor(amount * 10 / 100);
  const payout = payment ? Number(payment.payout_amount) : amount - fee;
  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? "";

  async function begin() {
    "use server";
    await startPayment(contractId);
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-12">
      <h1 className="text-2xl font-semibold text-slate-900">{project?.title ?? "결제"}</h1>
      <p className="mt-2 text-sm text-slate-500">상태 {STATUS_LABEL[payment?.status ?? ""] ?? "결제 전"}</p>
      <dl className="mt-6 space-y-2 text-sm">
        <div className="flex justify-between"><dt>계약 금액</dt><dd>{won(amount)}</dd></div>
        <div className="flex justify-between"><dt>수수료 10%</dt><dd>{won(fee)}</dd></div>
        <div className="flex justify-between"><dt>정산 금액</dt><dd>{won(payout)}</dd></div>
      </dl>
      {role === "client" && !payment && contract.status === "signed" && project?.status === "contract_pending" && (
        <form action={begin} className="mt-6">
          <button className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white">결제 준비</button>
        </form>
      )}
      {role === "client" && payment?.status === "ready" && (
        <div className="mt-6">
          <PayButton clientKey={clientKey} customerKey={user.id} orderId={payment.order_id} amount={Number(payment.amount)} orderName={project?.title ?? "WorkBridge 계약"} />
        </div>
      )}
      <DeliveryActions contractId={contractId} role={role} projectStatus={project?.status ?? ""} paymentStatus={payment?.status ?? null} />
      <p className="mt-8 text-sm"><Link href="/payments/history" className="underline">결제 내역</Link></p>
    </main>
  );
}

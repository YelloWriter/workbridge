import { Suspense } from "react";
import { PaymentSuccessResult } from "./result";

export default function SuccessPage({ searchParams }: { searchParams: Promise<{ paymentKey?: string; orderId?: string; amount?: string }> }) {
  return (
    <Suspense fallback={<p className="p-8 text-center">결제 결과를 확인하고 있습니다.</p>}>
      <SuccessContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SuccessContent({ searchParams }: { searchParams: Promise<{ paymentKey?: string; orderId?: string; amount?: string }> }) {
  const params = await searchParams;
  if (!params.paymentKey || !params.orderId || !params.amount) {
    return <p className="mx-auto max-w-xl p-8">결제 결과가 없습니다.</p>;
  }
  return <PaymentSuccessResult paymentKey={params.paymentKey} orderId={params.orderId} amount={params.amount} />;
}

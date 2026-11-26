"use client";

type TossPayment = {
  requestPayment: (request: {
    method: "CARD";
    amount: { currency: "KRW"; value: number };
    orderId: string;
    orderName: string;
    successUrl: string;
    failUrl: string;
  }) => Promise<void>;
};

declare global {
  interface Window {
    TossPayments?: (clientKey: string) => { payment: (options: { customerKey: string }) => TossPayment };
  }
}

function loadToss() {
  if (window.TossPayments) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://js.tosspayments.com/v2/standard";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("결제창을 불러오지 못했습니다."));
    document.head.appendChild(script);
  });
}

export function PayButton({
  clientKey,
  customerKey,
  orderId,
  amount,
  orderName,
}: {
  clientKey: string;
  customerKey: string;
  orderId: string;
  amount: number;
  orderName: string;
}) {
  async function openCheckout() {
    if (!clientKey.startsWith("test_")) {
      window.alert("테스트 클라이언트 키가 없습니다. 라이브 키는 열지 않습니다.");
      return;
    }
    await loadToss();
    const toss = window.TossPayments?.(clientKey);
    if (!toss) {
      window.alert("결제창을 불러오지 못했습니다.");
      return;
    }
    await toss.payment({ customerKey }).requestPayment({
      method: "CARD",
      amount: { currency: "KRW", value: amount },
      orderId,
      orderName,
      successUrl: `${window.location.origin}/payments/success`,
      failUrl: `${window.location.origin}/payments/fail`,
    });
  }

  return (
    <button type="button" onClick={() => void openCheckout()} className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white">
      테스트 결제하기
    </button>
  );
}

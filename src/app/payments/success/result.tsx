"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function PaymentSuccessResult({ paymentKey, orderId, amount }: { paymentKey: string; orderId: string; amount: string }) {
  const [message, setMessage] = useState("승인을 확인하고 있습니다.");

  useEffect(() => {
    let ignore = false;
    void fetch("/api/payments/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentKey, orderId, amount: Number(amount) }),
    })
      .then(async (response) => {
        const body = (await response.json()) as { ok?: boolean; error?: string };
        if (!ignore) setMessage(body.ok ? "결제가 보관되었습니다." : body.error || "승인에 실패했습니다.");
      })
      .catch(() => {
        if (!ignore) setMessage("승인 요청을 보내지 못했습니다.");
      });
    return () => {
      ignore = true;
    };
  }, [paymentKey, orderId, amount]);

  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-2xl font-semibold">결제 결과</h1>
      <p className="mt-4 text-sm text-slate-700">{message}</p>
      <Link href="/payments/history" className="mt-6 inline-block text-sm underline">내 결제 내역</Link>
    </main>
  );
}

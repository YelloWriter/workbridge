"use client";

import { useState } from "react";
import { approveDelivery, requestDelivery } from "@/app/payments/actions";

export function DeliveryActions({
  contractId,
  role,
  projectStatus,
  paymentStatus,
}: {
  contractId: string;
  role: "client" | "freelancer";
  projectStatus: string;
  paymentStatus: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(action: (id: string) => Promise<{ error: string | null }>) {
    setPending(true);
    const result = await action(contractId);
    setError(result.error);
    setPending(false);
  }

  const canDeliver = role === "freelancer" && paymentStatus === "paid" && projectStatus === "in_progress";
  const canApprove = role === "client" && paymentStatus === "paid" && projectStatus === "delivered";
  if (!canDeliver && !canApprove) return null;

  return (
    <div className="mt-6 space-y-2">
      {canDeliver && (
        <button type="button" disabled={pending} onClick={() => void run(requestDelivery)} className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">
          납품 요청
        </button>
      )}
      {canApprove && (
        <button type="button" disabled={pending} onClick={() => void run(approveDelivery)} className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">
          완료 승인
        </button>
      )}
      <p className="text-xs text-slate-500">실제 계좌 송금은 하지 않습니다. 수수료 10%를 뺀 금액만 확정합니다.</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

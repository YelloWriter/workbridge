"use client";
import { useActionState } from "react";
import { decideApplication } from "@/app/projects/[id]/applicants/actions";
import { buttonClass, inputClass } from "./section";

export function DecisionForm({ projectId, applicationId, proposedAmount }: { projectId: string; applicationId: string; proposedAmount: number }) {
  const [acceptState, accept, accepting] = useActionState(decideApplication.bind(null, projectId, applicationId, "accept"), {});
  const [rejectState, reject, rejecting] = useActionState(decideApplication.bind(null, projectId, applicationId, "reject"), {});
  return <div className="mt-6 space-y-4 border-t border-slate-200 pt-5">
    <form action={accept} className="space-y-4">
      <label className="block text-sm font-semibold">계약 협의 시작 금액 (원)
        <input name="agreed_amount" type="number" required min={1} max={999999999999} step={1} defaultValue={proposedAmount} className={inputClass} />
      </label>
      <label className="flex items-start gap-2 text-sm leading-6 text-slate-600">
        <input type="checkbox" required className="mt-1" />다른 검토중 지원서는 자동 거절되며, 양쪽에 알림이 전송되는 것을 확인했습니다.
      </label>
      <button className={buttonClass} disabled={accepting || rejecting}>{accepting ? "수락하고 있어요…" : "이 지원자 수락"}</button>
      {acceptState.error && <p role="alert" className="text-sm text-red-700">{acceptState.error}</p>}
    </form>
    <form action={reject}>
      <button className="rounded-lg border border-slate-300 px-5 py-3 text-sm text-slate-700 disabled:opacity-50" disabled={accepting || rejecting}>{rejecting ? "거절하고 있어요…" : "이 지원자 거절"}</button>
      {rejectState.error && <p role="alert" className="mt-3 text-sm text-red-700">{rejectState.error}</p>}
    </form>
  </div>;
}

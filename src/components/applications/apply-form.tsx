"use client";
import { useActionState } from "react";
import { submitApplication } from "@/app/projects/[id]/apply/actions";
import { buttonClass, inputClass } from "./section";

export function ApplyForm({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState(submitApplication.bind(null, projectId), {});
  return <form action={action} className="space-y-6 rounded-2xl border border-slate-200 p-5 sm:p-8">
    <label className="block text-sm font-semibold">자기소개와 제안 내용
      <textarea name="cover_letter" required maxLength={5000} rows={9} className={inputClass} defaultValue={state.values?.coverLetter}
        placeholder="프로젝트를 어떻게 진행할지, 관련 경험과 함께 소개해 주세요." />
      <span className="text-xs font-normal text-slate-500">최대 5,000자</span>
    </label>
    <div className="grid gap-6 sm:grid-cols-2">
      <label className="block text-sm font-semibold">예상 금액 (원)
        <input type="number" name="proposed_amount" required min={1} max={999999999999} step={1} className={inputClass} defaultValue={state.values?.amount} />
      </label>
      <label className="block text-sm font-semibold">예상 기간 (일)
        <input type="number" name="proposed_days" required min={1} max={3650} step={1} className={inputClass} defaultValue={state.values?.days} />
      </label>
    </div>
    <p className="text-sm leading-6 text-slate-600">제안 금액과 기간은 계약 전 협의할 수 있습니다. 제출한 지원서는 내 지원 현황에서 확인할 수 있습니다.</p>
    {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
    <button disabled={pending} className={buttonClass}>{pending ? "제출하고 있어요…" : "지원서 제출"}</button>
  </form>;
}

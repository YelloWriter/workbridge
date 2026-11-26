"use client";

import { useActionState } from "react";
import { applyEstimateToBudget, createEstimate, type EstimateState } from "@/app/ai-estimate/[projectId]/actions";
import type { UnitEstimate } from "./estimate-schema";

const primaryClass =
  "inline-flex items-center justify-center rounded-lg bg-teal-800 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-900 disabled:cursor-wait disabled:opacity-50";
const secondaryClass =
  "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-background px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50";

function won(amount: number) {
  return `${amount.toLocaleString("ko-KR")}원`;
}

export function EstimatePanel({
  projectId,
  description,
  budget,
  estimate,
  createdAt,
  canApply,
  lockMessage,
  unreadable = false,
}: {
  projectId: string;
  description: string;
  budget: number;
  estimate: UnitEstimate | null;
  createdAt: string | null;
  canApply: boolean;
  lockMessage: string | null;
  unreadable?: boolean;
}) {
  const [analyzeState, analyzeAction, analyzePending] = useActionState(createEstimate, {} as EstimateState);
  const [applyState, applyAction, applyPending] = useActionState(applyEstimateToBudget, {} as EstimateState);
  const pending = analyzePending || applyPending;
  const sameBudget = estimate != null && budget === estimate.total_amount;

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-slate-800">분석에 사용한 설명</h2>
        <p className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{description}</p>
        <p className="mt-3 text-xs leading-5 text-slate-500">등록된 설명을 그대로 사용합니다. 설명을 고쳤다면 프로젝트 수정 화면에서 먼저 저장해 주세요.</p>
        <form action={analyzeAction} className="mt-5 flex flex-wrap items-center gap-3">
          <input type="hidden" name="project_id" value={projectId} />
          <button type="submit" disabled={pending} className={estimate ? secondaryClass : primaryClass}>
            {analyzePending ? "만들고 있어요…" : analyzeState.error ? "다시 시도" : estimate ? "다시 분석" : "견적 만들기"}
          </button>
        </form>
        {analyzeState.error && <p role="alert" className="mt-3 text-sm text-red-700">{analyzeState.error}</p>}
      </section>

      {estimate ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-lg font-semibold">단위 기능 목록</h2>
            {createdAt && <p className="text-xs text-slate-500">{createdAt} 기준 · 가장 최근 견적</p>}
          </div>
          <ol className="space-y-3">
            {estimate.items.map((item, index) => (
              <li key={`${item.name}-${index}`} className="rounded-xl border border-slate-200 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="font-semibold">{index + 1}. {item.name}</h3>
                  <p className="text-sm font-semibold text-teal-800">{won(item.unit_price)}</p>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-700">{item.description}</p>
                <p className="mt-3 text-sm leading-6 text-slate-600"><span className="font-semibold text-slate-800">산정 근거. </span>{item.basis}</p>
              </li>
            ))}
          </ol>

          <div className="rounded-2xl bg-teal-50 p-5">
            <p className="text-sm text-teal-900">전체 총액</p>
            <p className="mt-1 text-2xl font-bold text-teal-950">{won(estimate.total_amount)}</p>
            <p className="mt-2 text-sm text-teal-900">지금 프로젝트 예산은 {budget > 0 ? won(budget) : "예산 협의"}입니다. 이 총액은 참고이며 계약 금액이 아닙니다.</p>
          </div>

          {sameBudget ? (
            <p className="text-sm text-slate-700">프로젝트 예산이 이미 이 참고 총액과 같습니다. 계약 금액은 바뀌지 않습니다.</p>
          ) : canApply ? (
            <form action={applyAction}>
              <input type="hidden" name="project_id" value={projectId} />
              <button type="submit" disabled={pending} className={primaryClass}>
                {applyPending ? "반영하고 있어요…" : "예산에 반영"}
              </button>
              {applyState.error && <p role="alert" className="mt-3 text-sm text-red-700">{applyState.error}</p>}
            </form>
          ) : (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{lockMessage}</p>
          )}
          {estimate && <p className="text-xs leading-5 text-slate-500">다시 분석하면 새 견적이 추가됩니다. 이전 견적의 내용은 바뀌지 않고, 화면에는 최근 것만 보입니다.</p>}
        </section>
      ) : (
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm leading-7 text-slate-700">
          {unreadable
            ? "방금 안내한 것처럼 저장된 견적은 보여 주지 않습니다. 다시 시도하면 새 견적을 만듭니다."
            : "아직 저장된 참고 견적이 없습니다. 위 버튼으로 만들면 기능 이름, 설명, 예상 단가, 산정 근거와 전체 총액이 나옵니다."}
        </p>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { CATEGORIES, SKILLS } from "@/lib/constants";
import { AiEstimateButton } from "@/components/ai/estimate-button";
import type { FormState } from "./model";
import { buttonClass, inputClass, PreviewNotice, subButtonClass } from "./ui";

export type ProjectFormValues = {
  title: string;
  description: string;
  category: string;
  skills: string[];
  budget: string;
  startDate: string;
  endDate: string;
};

const STEPS = ["기본 정보", "모집 조건", "기술 스택"] as const;

/**
 * 프로젝트 등록(3단계)·수정(한 화면) 폼.
 * 등록: ① 제목·설명·카테고리 → ② 모집 시작일·마감일·예산 → ③ 기술 스택
 * 수정: 세 묶음을 한 화면에 모두 보여 줌. 지원자가 있으면 예산·마감일은 잠김.
 */
export function ProjectForm({
  mode, action, initial, lockBudgetAndEnd = false, today, preview = false, cancelHref,
}: {
  mode: "create" | "edit";
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  initial?: ProjectFormValues;
  lockBudgetAndEnd?: boolean;
  today: string;
  preview?: boolean;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const [step, setStep] = useState(0);
  const [budget, setBudget] = useState(initial?.budget ?? "");
  const [startDate, setStartDate] = useState(initial?.startDate ?? today);
  const formRef = useRef<HTMLFormElement>(null);
  const stepped = mode === "create";
  const visible = (index: number) => !stepped || step === index;

  function stepIsValid(index: number) {
    const fields = formRef.current?.querySelectorAll<HTMLInputElement>(`[data-step="${index}"] input, [data-step="${index}"] select, [data-step="${index}"] textarea`);
    return Array.from(fields ?? []).every((field) => field.reportValidity());
  }
  function goNext() {
    if (stepIsValid(step)) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  const budgetNumber = Number(budget.replace(/,/g, ""));

  return (
    <form
      ref={formRef}
      action={formAction}
      onKeyDown={(event) => {
        // 등록 단계 중에 Enter 를 누르면 저장하지 않고 다음 단계로 간다.
        if (stepped && event.key === "Enter" && (event.target as HTMLElement).tagName === "INPUT" && step < STEPS.length - 1) {
          event.preventDefault();
          goNext();
        }
      }}
      className="space-y-6 rounded-2xl border border-slate-200 p-5 sm:p-8"
    >
      {preview && <PreviewNotice />}

      {stepped && (
        <ol aria-label="등록 단계" className="flex flex-wrap gap-2 text-sm">
          {STEPS.map((name, i) => (
            <li key={name} aria-current={i === step ? "step" : undefined}
              className={`rounded-full px-4 py-1.5 ${i === step ? "bg-teal-800 font-semibold text-white" : i < step ? "bg-teal-50 text-teal-800" : "bg-slate-100 text-slate-500"}`}>
              {i + 1}. {name}
            </li>
          ))}
        </ol>
      )}

      <div data-step="0" hidden={!visible(0)} className="space-y-6">
        <label className="block text-sm font-semibold">제목
          <input name="title" required minLength={2} maxLength={100} defaultValue={initial?.title} className={inputClass}
            placeholder="예: 쇼핑몰 상품 목록 화면 제작" />
        </label>
        <label className="block text-sm font-semibold">프로젝트 설명
          <textarea name="description" required minLength={10} maxLength={5000} rows={9} defaultValue={initial?.description} className={inputClass}
            placeholder="무엇을 만들고 싶은지, 원하는 결과물과 참고 자료를 적어 주세요." />
          <span className="text-xs font-normal text-slate-500">10~5,000자</span>
        </label>
        <label className="block text-sm font-semibold">카테고리
          <select name="category" required defaultValue={initial?.category ?? ""} className={inputClass}>
            <option value="" disabled>선택해 주세요</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>

      <div data-step="1" hidden={!visible(1)} className="space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <label className="block text-sm font-semibold">모집 시작일
            <input type="date" name="start_date" required value={startDate} onChange={(e) => setStartDate(e.target.value)}
              min={mode === "create" ? today : undefined} className={inputClass} />
            <span className="text-xs font-normal text-slate-500">오늘이면 바로 모집 중, 앞 날짜면 모집 예정</span>
          </label>
          <label className="block text-sm font-semibold">모집 마감일
            <input type="date" name="end_date" required defaultValue={initial?.endDate} readOnly={lockBudgetAndEnd}
              min={mode === "create" ? (startDate || today) : undefined} className={`${inputClass} ${lockBudgetAndEnd ? "bg-slate-50" : ""}`} />
            <span className="text-xs font-normal text-slate-500">마감일 밤 11시 59분까지 지원할 수 있어요</span>
          </label>
        </div>
        <div>
          <label className="block text-sm font-semibold" htmlFor="budget">예산 (원)</label>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <input id="budget" type="number" name="budget" required min={0} max={999999999999} step={1} inputMode="numeric"
              value={budget} onChange={(e) => setBudget(e.target.value)} readOnly={lockBudgetAndEnd}
              className={`w-full max-w-xs rounded-lg border border-slate-300 bg-background p-3 focus:outline-2 focus:outline-teal-600 ${lockBudgetAndEnd ? "bg-slate-50" : ""}`} />
            {/* 4번이 만든 AI 단가 분석 버튼. 수정 화면에서는 견적 화면으로 이동하고, 등록 화면에서는 안내만 보여 준다. */}
            <div data-slot="ai-estimate-button">
              <AiEstimateButton />
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {Number.isFinite(budgetNumber) && budget !== "" ? (budgetNumber > 0 ? `${budgetNumber.toLocaleString("ko-KR")}원` : "0원이면 '예산 협의'로 보여요") : "금액을 숫자로 입력해 주세요"}
          </p>
        </div>
        {lockBudgetAndEnd && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">지원자가 있어서 예산과 모집 마감일은 바꿀 수 없어요.</p>
        )}
      </div>

      <fieldset data-step="2" hidden={!visible(2)}>
        <legend className="text-sm font-semibold">필요한 기술 스택 <span className="font-normal text-slate-500">(최대 10개)</span></legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {SKILLS.map((skill) => (
            <label key={skill} className="cursor-pointer">
              <input type="checkbox" name="skills" value={skill} defaultChecked={initial?.skills.includes(skill)} className="peer sr-only" />
              <span className="inline-flex rounded-full border border-slate-300 px-4 py-2 text-sm peer-checked:border-teal-800 peer-checked:bg-teal-800 peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-teal-600">{skill}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        {stepped && step > 0 && <button type="button" onClick={() => setStep((s) => s - 1)} className={subButtonClass}>이전</button>}
        {stepped && step < STEPS.length - 1 && <button type="button" onClick={goNext} className={buttonClass}>다음</button>}
        {(!stepped || step === STEPS.length - 1) && (
          <button type="submit" disabled={pending} className={buttonClass}>
            {pending ? "저장하고 있어요…" : mode === "create" ? "프로젝트 등록" : "수정 내용 저장"}
          </button>
        )}
        <Link href={cancelHref} className="text-sm text-slate-600 underline">취소</Link>
      </div>
    </form>
  );
}

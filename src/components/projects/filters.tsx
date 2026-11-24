import Link from "next/link";
import { CATEGORIES, SKILLS } from "@/lib/constants";
import { activeFilterCount, displayStatusLabels, type ListParams } from "./model";
import { buttonClass, inputClass, subButtonClass } from "./ui";

/** 목록의 검색·필터 폼. 주소(?)로 보내는 일반 폼이라 자바스크립트 없이도 동작합니다. */
export function ProjectFilters({ params }: { params: ListParams }) {
  const count = activeFilterCount(params);
  return (
    <form action="/projects" method="get" className="mb-6 space-y-4 rounded-2xl border border-slate-200 p-4 sm:p-6">
      {params.sort !== "latest" && <input type="hidden" name="sort" value={params.sort} />}
      <div className="flex flex-wrap gap-3">
        <label className="min-w-0 flex-1">
          <span className="sr-only">키워드 (제목과 설명에서 찾아요)</span>
          <input type="search" name="q" defaultValue={params.q} maxLength={100} placeholder="제목이나 설명에서 키워드 검색"
            className="w-full rounded-lg border border-slate-300 bg-background p-3 focus:outline-2 focus:outline-teal-600" />
        </label>
        <button type="submit" className={buttonClass}>검색</button>
      </div>

      <details open={count > 0} className="group">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">
          필터 {count > 0 && <span className="ml-1 rounded-full bg-teal-800 px-2 py-0.5 text-xs text-white">{count}</span>}
        </summary>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <label className="block text-sm font-semibold">카테고리
            <select name="category" defaultValue={params.category} className={inputClass}>
              <option value="">전체</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold">모집 상태
            <select name="status" defaultValue={params.status} className={inputClass}>
              <option value="">전체</option>
              {(Object.keys(displayStatusLabels) as (keyof typeof displayStatusLabels)[]).map((s) => <option key={s} value={s}>{displayStatusLabels[s]}</option>)}
            </select>
          </label>
          <div className="text-sm font-semibold">예산 범위 (원)
            <div className="mt-2 flex items-center gap-2">
              <input type="number" name="budget_min" min={0} step={1} defaultValue={params.budgetMin ?? ""} aria-label="최소 예산" placeholder="최소"
                className="w-full rounded-lg border border-slate-300 bg-background p-3 focus:outline-2 focus:outline-teal-600" />
              <span aria-hidden>~</span>
              <input type="number" name="budget_max" min={0} step={1} defaultValue={params.budgetMax ?? ""} aria-label="최대 예산" placeholder="최대"
                className="w-full rounded-lg border border-slate-300 bg-background p-3 focus:outline-2 focus:outline-teal-600" />
            </div>
          </div>
          <div className="text-sm font-semibold">모집 마감일 범위
            <div className="mt-2 flex items-center gap-2">
              <input type="date" name="deadline_from" defaultValue={params.deadlineFrom} aria-label="마감일 시작"
                className="w-full rounded-lg border border-slate-300 bg-background p-3 focus:outline-2 focus:outline-teal-600" />
              <span aria-hidden>~</span>
              <input type="date" name="deadline_to" defaultValue={params.deadlineTo} aria-label="마감일 끝"
                className="w-full rounded-lg border border-slate-300 bg-background p-3 focus:outline-2 focus:outline-teal-600" />
            </div>
          </div>
        </div>
        <fieldset className="mt-5">
          <legend className="text-sm font-semibold">기술 스택 <span className="font-normal text-slate-500">(하나라도 맞으면 보여요)</span></legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {SKILLS.map((skill) => (
              <label key={skill} className="cursor-pointer">
                <input type="checkbox" name="skills" value={skill} defaultChecked={params.skills.includes(skill)} className="peer sr-only" />
                <span className="inline-flex rounded-full border border-slate-300 px-3 py-1.5 text-sm peer-checked:border-teal-800 peer-checked:bg-teal-800 peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-teal-600">{skill}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="submit" className={buttonClass}>필터 적용</button>
          <Link href="/projects" className={subButtonClass}>필터 초기화</Link>
        </div>
      </details>
    </form>
  );
}

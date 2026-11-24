import Link from "next/link";
import type { ReactNode } from "react";
import {
  currentTime, displayStatusLabels, formatDate, isNew, listHref, money, remainingText, PAGE_SIZE,
  type DisplayStatus, type ListParams, type Project,
} from "./model";

// 3번 화면(지원·알림)과 같은 색·모양을 씁니다. (teal 강조, slate 글자)
export const inputClass = "mt-2 w-full rounded-lg border border-slate-300 bg-background p-3 focus:outline-2 focus:outline-teal-600";
export const buttonClass = "inline-flex items-center justify-center rounded-lg bg-teal-800 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-900 disabled:cursor-wait disabled:opacity-50";
export const subButtonClass = "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-background px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50";
export const dangerButtonClass = "inline-flex items-center justify-center rounded-lg border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:opacity-50";

export function PageShell({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:py-14">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-sm font-semibold text-teal-700">WorkBridge</p>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          {description && <p className="mt-3 text-slate-600">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </main>
  );
}

export function Notice({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "preview" }) {
  const color = tone === "preview" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-700";
  return <p role="status" className={`rounded-xl border p-5 text-sm leading-7 ${color}`}>{children}</p>;
}

/** 키(.env.local)가 없을 때 위에 붙는 안내. 보이는 목록은 가짜 데이터입니다. */
export function PreviewNotice() {
  return <div className="mb-6"><Notice tone="preview">미리보기 화면입니다. 데이터베이스 연결 전이라 <b>가짜 데이터</b>가 보이고, 저장은 되지 않습니다.</Notice></div>;
}

const badgeColors: Record<DisplayStatus, string> = {
  scheduled: "bg-amber-50 text-amber-800 ring-amber-200",
  recruiting: "bg-teal-50 text-teal-800 ring-teal-200",
  closed: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function StatusBadge({ status, label }: { status: DisplayStatus; label?: string }) {
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${badgeColors[status]}`}>{label ?? displayStatusLabels[status]}</span>;
}

export function SkillTags({ skills }: { skills: string[] }) {
  if (!skills.length) return null;
  return <ul className="flex flex-wrap gap-1.5">{skills.map((s) => <li key={s} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">{s}</li>)}</ul>;
}

export function ProjectCard({ project, footer, statusLabel }: { project: Project; footer?: ReactNode; statusLabel?: string }) {
  const now = currentTime();
  return (
    <article className="rounded-xl border border-slate-200 p-5 transition hover:border-teal-600">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={project.display_status} label={statusLabel} />
        {isNew(project.created_at, now) && <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">NEW</span>}
        <span className="text-xs text-slate-500">{project.category}</span>
      </div>
      <h2 className="mt-3 text-lg font-semibold leading-snug">
        <Link href={`/projects/${project.id}`} className="hover:underline">{project.title}</Link>
      </h2>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{project.description}</p>
      <div className="mt-3"><SkillTags skills={project.skills} /></div>
      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div className="flex gap-1.5"><dt className="text-slate-500">예산</dt><dd className="font-semibold">{money(project.budget)}</dd></div>
        <div className="flex gap-1.5"><dt className="text-slate-500">모집 마감</dt><dd>{formatDate(project.recruit_end_at)}</dd></div>
        {project.display_status !== "closed" && <div className="text-teal-800">{remainingText(project.recruit_end_at, now)}</div>}
        <div className="flex gap-1.5"><dt className="text-slate-500">지원자</dt><dd>{project.applicant_count}명</dd></div>
      </dl>
      {footer && <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">{footer}</div>}
    </article>
  );
}

export function Pagination({ params, total }: { params: ListParams; total: number }) {
  const last = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (last <= 1) return null;
  const from = Math.max(1, Math.min(params.page - 2, last - 4));
  const pages = Array.from({ length: Math.min(5, last) }, (_, i) => from + i);
  const base = "inline-flex h-10 min-w-10 items-center justify-center rounded-lg px-3 text-sm";
  return (
    <nav aria-label="페이지 이동" className="mt-8 flex flex-wrap items-center justify-center gap-1.5">
      {params.page > 1 && <Link href={listHref(params, { page: params.page - 1 })} className={`${base} border border-slate-300 hover:bg-slate-50`}>이전</Link>}
      {pages.map((n) => (
        <Link key={n} href={listHref(params, { page: n })} aria-current={n === params.page ? "page" : undefined}
          className={`${base} ${n === params.page ? "bg-teal-800 font-semibold text-white" : "border border-slate-300 hover:bg-slate-50"}`}>{n}</Link>
      ))}
      {params.page < last && <Link href={listHref(params, { page: params.page + 1 })} className={`${base} border border-slate-300 hover:bg-slate-50`}>다음</Link>}
    </nav>
  );
}

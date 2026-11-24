import Link from "next/link";
import { Suspense } from "react";
import { requireMember, isSupabaseConfigured } from "@/components/applications/server";
import { Section, Notice, SetupNotice } from "@/components/applications/section";
import { type Application, statusLabels, reasonLabels, money, dateTime } from "@/components/applications/model";

export default function MyApplicationsPage() {
  return <Suspense fallback={<Section title="내 지원 현황" description="지원 내역을 확인하고 있습니다."><Notice>불러오는 중…</Notice></Section>}><MyApplicationsContent /></Suspense>;
}
async function MyApplicationsContent() {
  if (!isSupabaseConfigured()) return <Section title="내 지원 현황" description="지원 내역과 결과를 한곳에서 확인하세요."><SetupNotice /></Section>;
  const { supabase, user, profile } = await requireMember("/me/applications");
  if (profile.role !== "freelancer") return <Section title="내 지원 현황" description="프리랜서의 지원 내역입니다."><Notice>의뢰인은 본인 프로젝트의 지원자 관리 메뉴를 이용해 주세요.</Notice></Section>;
  const { data, error } = await supabase.from("applications")
    .select("id,project_id,freelancer_id,cover_letter,proposed_amount,proposed_days,status,reject_reason,accepted_agreed_amount,created_at")
    .eq("freelancer_id", user.id).is("deleted_at", null).order("created_at", { ascending: false });
  if (error) throw new Error("지원 내역을 불러오지 못했습니다.");
  const applications = (data ?? []) as Application[];
  const ids = [...new Set(applications.map(a => a.project_id))];
  const projects = ids.length ? await supabase.from("projects").select("id,title").in("id", ids) : null;
  if (projects?.error) throw new Error("프로젝트 정보를 불러오지 못했습니다.");
  const titles = new Map((projects?.data ?? []).map(p => [p.id, p.title]));
  return <Section title="내 지원 현황" description="거절된 지원서도 결과와 이유를 계속 확인할 수 있습니다.">
    {!applications.length ? <Notice>아직 지원한 프로젝트가 없습니다. <Link href="/projects" className="underline">프로젝트 찾기</Link></Notice>
      : <div className="space-y-4">{applications.map(app => <article key={app.id} className="rounded-xl border border-slate-200 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="font-semibold"><Link href={`/projects/${app.project_id}`}>{titles.get(app.project_id) ?? "프로젝트 지원 내역"}</Link></h2>
          <span className={`rounded-full px-3 py-1 text-sm ${app.status === "accepted" ? "bg-teal-50 text-teal-800" : "bg-slate-100 text-slate-800"}`}>{statusLabels[app.status]}</span>
        </div>
        <p className="mt-3 text-sm text-slate-600">제안 {money(app.proposed_amount)} · {app.proposed_days}일</p>
        <p className="mt-2 text-xs text-slate-500">지원일 {dateTime(app.created_at)}</p>
        {app.reject_reason && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{reasonLabels[app.reject_reason]}</p>}
        {app.status === "accepted" && <p className="mt-4 text-sm text-teal-800">계약 협의 시작 금액: {money(app.accepted_agreed_amount ?? app.proposed_amount)} · <Link className="underline" href="/contracts">계약 목록 보기</Link></p>}
        <details className="mt-5"><summary className="cursor-pointer text-sm text-teal-800">내 지원서 보기</summary><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">{app.cover_letter}</p></details>
      </article>)}</div>}
  </Section>;
}

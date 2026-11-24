import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireMember, isSupabaseConfigured } from "@/components/applications/server";
import { Section, Notice, SetupNotice } from "@/components/applications/section";
import { DecisionForm } from "@/components/applications/decision-form";
import { type Application, statusLabels, reasonLabels, money, dateTime, uuidPattern } from "@/components/applications/model";
import { ApplicationPagination, applicationPageSize, pageNumber } from "@/components/applications/pagination";

type ApplicantsProps = { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string | string[] }> };
export default function ApplicantsPage(props: ApplicantsProps) {
  return <Suspense fallback={<Section title="지원자 관리" description="지원서를 확인하고 있습니다."><Notice>불러오는 중…</Notice></Section>}><ApplicantsContent {...props} /></Suspense>;
}
async function ApplicantsContent({ params, searchParams }: ApplicantsProps) {
  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();
  if (!isSupabaseConfigured()) return <Section title="지원자 관리" description="지원서를 검토하고 함께할 파트너를 선택하세요."><SetupNotice /></Section>;
  const { supabase, user, profile } = await requireMember(`/projects/${id}/applicants`);
  const { data: project, error } = await supabase.from("projects").select("id,title,client_id,status").eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw new Error("프로젝트를 불러오지 못했습니다.");
  if (!project || profile.role !== "client" || project.client_id !== user.id) notFound();
  const page = pageNumber((await searchParams).page);
  const { data, error: applicationsError, count } = await supabase.from("applications")
    .select("id,project_id,freelancer_id,cover_letter,proposed_amount,proposed_days,status,reject_reason,accepted_agreed_amount,created_at,freelancer:profiles!applications_freelancer_id_fkey(name)", { count: "exact" })
    .eq("project_id", id).is("deleted_at", null).order("created_at", { ascending: true }).order("id", { ascending: true })
    .range((page - 1) * applicationPageSize, page * applicationPageSize - 1);
  if (applicationsError) throw new Error("지원서를 불러오지 못했습니다.");
  const applications = (data ?? []) as unknown as (Application & { freelancer: { name: string | null } | null })[];
  return <Section title="지원자 관리" description={project.title}>
    {project.status === "contract_pending" && <div className="mb-6"><Notice>지원자 선정이 끝났습니다. 계약서가 준비되면 <Link className="underline" href="/contracts">계약 목록</Link>에서 확인할 수 있습니다.</Notice></div>}
    <p className="mb-4 text-sm text-slate-600">지원서 {count ?? 0}개</p>
    {!applications.length ? <Notice>아직 도착한 지원서가 없습니다.</Notice> : <div className="space-y-4">{applications.map((app, index) =>
      <article key={app.id} className="rounded-xl border border-slate-200 p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">{app.freelancer?.name ?? `지원자 ${(page - 1) * applicationPageSize + index + 1}`} <Link href={`/users/${app.freelancer_id}`} className="ml-3 text-sm font-normal text-teal-700 underline">프로필 보기</Link></h2>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-800">{statusLabels[app.status]}</span>
        </div>
        <p className="mt-3 text-sm text-slate-600">{money(app.proposed_amount)} · {app.proposed_days}일 · {dateTime(app.created_at)}</p>
        <details className="mt-5"><summary className="cursor-pointer text-sm font-semibold text-teal-800">지원서 보기</summary>
          <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7">{app.cover_letter}</p>
        </details>
        {app.reject_reason && <p className="mt-4 text-sm text-slate-600">{reasonLabels[app.reject_reason]}</p>}
        {app.status === "accepted" && app.accepted_agreed_amount && <p className="mt-4 text-sm">계약 협의 시작 금액: {money(app.accepted_agreed_amount)}</p>}
        {app.status === "pending" && project.status === "recruiting" && <DecisionForm projectId={id} applicationId={app.id} proposedAmount={app.proposed_amount} />}
      </article>)}</div>}
    <ApplicationPagination path={`/projects/${id}/applicants`} page={page} count={count ?? 0} />
  </Section>;
}

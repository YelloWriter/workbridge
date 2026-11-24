import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { requireMember, isSupabaseConfigured } from "@/components/applications/server";
import { isProfileComplete, uuidPattern } from "@/components/applications/model";
import { Section, Notice, SetupNotice } from "@/components/applications/section";
import { ApplyForm } from "@/components/applications/apply-form";

export default function ApplyPage(props: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<Section title="프로젝트 지원" description="프로젝트를 확인하고 있습니다."><Notice>불러오는 중…</Notice></Section>}><ApplyContent {...props} /></Suspense>;
}
async function ApplyContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();
  if (!isSupabaseConfigured()) return <Section title="프로젝트 지원" description="경험과 제안을 전해 주세요."><SetupNotice /></Section>;
  const path = `/projects/${id}/apply`;
  const { supabase, user, profile, now } = await requireMember(path);
  if (profile.role !== "freelancer") return <Section title="프로젝트 지원" description="프리랜서 전용 메뉴입니다."><Notice>프리랜서 계정으로 이용해 주세요.</Notice></Section>;
  if (!isProfileComplete(profile)) redirect(`/me/profile?next=${encodeURIComponent(path)}`);
  const [{ data: project, error }, { data: existing, error: applicationError }] = await Promise.all([
    supabase.from("projects").select("id,title,status,client_id,recruit_start_at,recruit_end_at").eq("id", id).is("deleted_at", null).maybeSingle(),
    supabase.from("applications").select("id").eq("project_id", id).eq("freelancer_id", user.id).maybeSingle(),
  ]);
  if (error || applicationError) throw new Error("프로젝트 정보를 불러오지 못했습니다.");
  if (!project) notFound();
  const closed = project.status !== "recruiting" || (project.recruit_start_at && new Date(project.recruit_start_at).getTime() > now)
    || (project.recruit_end_at && new Date(project.recruit_end_at).getTime() <= now);
  return <Section title="프로젝트 지원" description={project.title}>
    {existing ? <Notice>이미 지원했습니다. <Link className="underline" href="/me/applications">내 지원 현황 보기</Link></Notice>
      : closed ? <Notice>현재 지원을 받고 있지 않습니다.</Notice> : <ApplyForm projectId={id} />}
  </Section>;
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/profile";
import {
  displayStatus, kstDate, kstDayEnd, kstDayStart, parseProjectForm, projectErrorText, uuidPattern,
  type FormState,
} from "@/components/projects/model";

const NOT_CONNECTED: FormState = { error: "데이터베이스가 아직 연결되지 않아 저장되지 않습니다. (화면 확인용 미리보기)" };

function refresh(projectId?: string) {
  revalidatePath("/");
  revalidatePath("/projects");
  revalidatePath("/me/projects");
  revalidatePath("/me/bookmarks");
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

/** 로그인한 사람과 역할을 확인한다. 로그인·프로필이 모자라면 해당 화면으로 보낸다. (모든 동작의 첫 단계) */
async function requireMember(next: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  const { data: profile } = await supabase.from("profiles").select("role, name").eq("id", user.id).maybeSingle();
  if (!profile?.role) redirect(`/onboarding/role?next=${encodeURIComponent(next)}`);
  return { supabase, user, profile };
}

/** 의뢰인만. 이름이 비어 있으면 프로필 화면으로 보낸다. (1번 명세: "이름이 비어 있음"이 기준) */
async function requireClient(next: string) {
  const member = await requireMember(next);
  if (member.profile.role !== "client") return { error: "의뢰인 계정으로 이용해 주세요." } as const;
  if (!member.profile.name?.trim()) redirect(`/me/profile?next=${encodeURIComponent(next)}`);
  return member;
}

export async function createProject(_prev: FormState, form: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return NOT_CONNECTED;
  const member = await requireClient("/projects/new");
  if ("error" in member) return { error: member.error };
  const parsed = parseProjectForm(form);
  if (!parsed.ok) return { error: parsed.error };
  const v = parsed.value;
  if (v.endDate < kstDate(Date.now())) return { error: "모집 마감일은 오늘 이후로 정해 주세요." };

  // 등록할 때의 상태: 시작일이 앞으로이면 모집 예정, 아니면 모집 중 (TEAM.md)
  const status = new Date(kstDayStart(v.startDate)).getTime() > Date.now() ? "scheduled" : "recruiting";
  const { data, error } = await member.supabase.from("projects").insert({
    client_id: member.user.id,
    title: v.title, description: v.description, category: v.category, skills: v.skills, budget: v.budget,
    recruit_start_at: kstDayStart(v.startDate), recruit_end_at: kstDayEnd(v.endDate), status,
  }).select("id").single();
  if (error || !data) return { error: "프로젝트를 등록하지 못했습니다. 입력 내용을 확인하고 다시 시도해 주세요." };
  refresh();
  redirect(`/projects/${data.id}`);
}

export async function updateProject(projectId: string, _prev: FormState, form: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return NOT_CONNECTED;
  if (!uuidPattern.test(projectId)) return { error: "올바른 프로젝트가 아닙니다." };
  const member = await requireClient(`/projects/${projectId}/edit`);
  if ("error" in member) return { error: member.error };
  const parsed = parseProjectForm(form);
  if (!parsed.ok) return { error: parsed.error };
  const v = parsed.value;

  const { data: current } = await member.supabase.from("projects")
    .select("id, client_id, status, budget, recruit_start_at, recruit_end_at")
    .eq("id", projectId).is("deleted_at", null).maybeSingle();
  if (!current || current.client_id !== member.user.id) return { error: "내가 등록한 프로젝트만 수정할 수 있습니다." };
  if (!["scheduled", "recruiting"].includes(current.status)
    || displayStatus(current.status, current.recruit_start_at, current.recruit_end_at) === "closed") {
    return { error: "모집이 끝났거나 계약이 진행 중인 프로젝트는 수정할 수 없습니다." };
  }

  // 지원자가 있으면 예산·마감일은 못 바꾼다. (DB 에서도 한 번 더 막는다)
  const { data: counts } = await member.supabase.rpc("project_applicant_counts", { p_project_ids: [projectId] });
  const hasApplicants = ((counts ?? []) as { applicant_count: number }[]).some((c) => c.applicant_count > 0);
  if (hasApplicants) {
    if (v.budget !== Number(current.budget) || v.endDate !== kstDate(current.recruit_end_at)) {
      return { error: "지원자가 있는 프로젝트는 예산과 모집 마감일을 바꿀 수 없습니다." };
    }
    if (new Date(kstDayStart(v.startDate)).getTime() > Date.now()) {
      return { error: "지원자가 있는 프로젝트는 모집 시작일을 앞으로 미룰 수 없습니다." };
    }
  } else if (v.endDate < kstDate(Date.now())) {
    return { error: "모집 마감일은 오늘 이후로 정해 주세요." };
  }

  const status = new Date(kstDayStart(v.startDate)).getTime() > Date.now() ? "scheduled" : "recruiting";
  const { error } = await member.supabase.from("projects").update({
    title: v.title, description: v.description, category: v.category, skills: v.skills, budget: v.budget,
    recruit_start_at: kstDayStart(v.startDate), recruit_end_at: kstDayEnd(v.endDate), status,
  }).eq("id", projectId).eq("client_id", member.user.id);
  if (error) return { error: projectErrorText(error.message) };
  refresh(projectId);
  redirect(`/projects/${projectId}`);
}

/** 의뢰인의 "모집 마감" 버튼. projects.status 를 직접 바꾸지 않고 3번의 close_project_applications 함수 하나를 부른다. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState 가 넘기는 자리 인자
export async function closeProject(projectId: string, _prev: FormState, _form: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return NOT_CONNECTED;
  if (!uuidPattern.test(projectId)) return { error: "올바른 프로젝트가 아닙니다." };
  const member = await requireClient("/me/projects");
  if ("error" in member) return { error: member.error };

  const { data: project } = await member.supabase.from("projects")
    .select("id, client_id, status, recruit_start_at").eq("id", projectId).is("deleted_at", null).maybeSingle();
  if (!project || project.client_id !== member.user.id) return { error: "내가 등록한 프로젝트만 마감할 수 있습니다." };
  if (project.status === "scheduled") {
    // 시작일은 지났는데 상태가 아직 모집 예정이면 모집 중으로 맞춘 뒤 마감한다.
    if (new Date(project.recruit_start_at).getTime() > Date.now()) return { error: "모집이 시작되기 전에는 마감할 수 없습니다." };
    const fixed = await member.supabase.from("projects").update({ status: "recruiting" }).eq("id", projectId).eq("client_id", member.user.id);
    if (fixed.error) return { error: projectErrorText(fixed.error.message) };
  }
  const { data: rejected, error } = await member.supabase.rpc("close_project_applications", { p_project_id: projectId });
  if (error) return { error: projectErrorText(error.message) };
  refresh(projectId);
  const n = Number(rejected ?? 0);
  return { message: n > 0 ? `모집을 마감했습니다. 검토 중이던 지원 ${n}건은 거절 처리되었습니다.` : "모집을 마감했습니다." };
}

/** 삭제는 deleted_at 만 채우는 소프트 삭제입니다. (DB 함수 soft_delete_project) */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState 가 넘기는 자리 인자
export async function deleteProject(projectId: string, _prev: FormState, _form: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return NOT_CONNECTED;
  if (!uuidPattern.test(projectId)) return { error: "올바른 프로젝트가 아닙니다." };
  const member = await requireClient("/me/projects");
  if ("error" in member) return { error: member.error };
  const { error } = await member.supabase.rpc("soft_delete_project", { p_project_id: projectId });
  if (error) return { error: projectErrorText(error.message) };
  refresh(projectId);
  redirect("/me/projects");
}

/** 북마크 켜기/끄기. 프리랜서만. wanted 가 true 이면 추가, false 이면 삭제 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState 가 넘기는 자리 인자
export async function toggleBookmark(projectId: string, wanted: boolean, _prev: FormState, _form: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return NOT_CONNECTED;
  if (!uuidPattern.test(projectId)) return { error: "올바른 프로젝트가 아닙니다." };
  const { supabase, user, profile } = await requireMember(`/projects/${projectId}`);
  if (profile.role !== "freelancer") return { error: "북마크는 프리랜서 계정에서 쓸 수 있습니다." };
  const result = wanted
    ? await supabase.from("bookmarks").upsert({ user_id: user.id, project_id: projectId }, { onConflict: "user_id,project_id", ignoreDuplicates: true })
    : await supabase.from("bookmarks").delete().eq("user_id", user.id).eq("project_id", projectId);
  if (result.error) return { error: "북마크를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  refresh(projectId);
  return {};
}

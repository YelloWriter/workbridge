import "server-only";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/profile";
import type { UserRole } from "@/lib/constants";
import {
  displayStatus, PAGE_SIZE, PROJECT_COLUMNS, kstDayEnd, kstDayStart,
  type DisplayStatus, type ListParams, type Project,
} from "./model";
import { sampleFind, sampleProjects, sampleSearch, SAMPLE_CLIENT } from "./sample";
import { syncProjectStatuses } from "./sync";

export { isSupabaseConfigured };

/** 응답이 끝난 뒤 상태 자동 전환을 한 번 실행한다. (sync.ts 설명 참고) */
function scheduleSync() {
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  after(() => syncProjectStatuses());
}

export type Viewer = {
  id: string | null;
  role: UserRole | null;
  name: string | null;
};

/** 지금 보는 사람. 로그인 전이면 id 가 null. */
export async function getViewer(): Promise<Viewer> {
  if (!isSupabaseConfigured()) return { id: null, role: null, name: null };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { id: null, role: null, name: null };
  const { data } = await supabase.from("profiles").select("role, name").eq("id", user.id).maybeSingle();
  return { id: user.id, role: (data?.role as UserRole | null) ?? null, name: data?.name ?? null };
}

type Row = Omit<Project, "display_status" | "applicant_count">;

async function withCounts(rows: Row[]): Promise<Project[]> {
  const counts = new Map<string, number>();
  if (rows.length) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("project_applicant_counts", { p_project_ids: rows.map((r) => r.id) });
    // 지원 테이블(0300)이 아직 없으면 숫자만 0으로 두고 계속 보여 준다.
    if (!error) for (const c of (data ?? []) as { project_id: string; applicant_count: number }[]) counts.set(c.project_id, c.applicant_count);
  }
  const now = Date.now();
  return rows.map((r) => ({
    ...r,
    budget: Number(r.budget),
    skills: r.skills ?? [],
    display_status: displayStatus(r.status, r.recruit_start_at, r.recruit_end_at, now),
    applicant_count: counts.get(r.id) ?? 0,
  }));
}

export type ListResult = { items: Project[]; total: number };

export async function searchProjects(params: ListParams, perPage = PAGE_SIZE): Promise<ListResult> {
  if (!isSupabaseConfigured()) return sampleSearch(params, perPage);
  scheduleSync();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_projects", {
    p_q: params.q || null,
    p_category: params.category || null,
    p_budget_min: params.budgetMin,
    p_budget_max: params.budgetMax,
    p_skills: params.skills.length ? params.skills : null,
    p_deadline_from: params.deadlineFrom ? kstDayStart(params.deadlineFrom) : null,
    p_deadline_to: params.deadlineTo ? kstDayEnd(params.deadlineTo) : null,
    p_status: params.status || null,
    p_sort: params.sort,
    p_limit: perPage,
    p_offset: (params.page - 1) * perPage,
  });
  if (error) throw new Error("프로젝트 목록을 불러오지 못했습니다.");
  const rows = (data ?? []) as (Row & { total_count: number })[];
  return { items: await withCounts(rows), total: rows.length ? Number(rows[0].total_count) : 0 };
}

export async function getProject(id: string): Promise<Project | null> {
  if (!isSupabaseConfigured()) return sampleFind(id);
  scheduleSync();
  const supabase = await createClient();
  const { data, error } = await supabase.from("projects").select(PROJECT_COLUMNS).eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw new Error("프로젝트를 불러오지 못했습니다.");
  if (!data) return null;
  return (await withCounts([data as Row]))[0];
}

export type ClientSummary = { id: string; name: string | null; company_name: string | null; business_field: string | null };

export async function getClientSummary(clientId: string): Promise<ClientSummary | null> {
  if (!isSupabaseConfigured()) return clientId === SAMPLE_CLIENT.id ? SAMPLE_CLIENT : null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, name, company_name, business_field").eq("id", clientId).maybeSingle();
  return data ?? null;
}

/** 같은 카테고리이거나 기술이 겹치는 모집 중 프로젝트. 겹치는 것이 많은 순으로 최대 4개. */
export async function getRecommended(project: Project): Promise<Project[]> {
  const base: ListParams = {
    q: "", category: "", skills: [], budgetMin: null, budgetMax: null,
    deadlineFrom: "", deadlineTo: "", status: "recruiting", sort: "latest", page: 1,
  };
  const [sameCategory, sameSkills] = await Promise.all([
    searchProjects({ ...base, category: project.category }, 20),
    project.skills.length ? searchProjects({ ...base, skills: project.skills }, 20) : Promise.resolve<ListResult>({ items: [], total: 0 }),
  ]);
  const byId = new Map<string, Project>();
  for (const p of [...sameCategory.items, ...sameSkills.items]) if (p.id !== project.id) byId.set(p.id, p);
  const score = (p: Project) =>
    (p.category === project.category ? 2 : 0) + p.skills.filter((s) => project.skills.includes(s)).length;
  return [...byId.values()].sort((a, b) => score(b) - score(a) || b.created_at.localeCompare(a.created_at)).slice(0, 4);
}

export async function listMyProjects(userId: string): Promise<Project[]> {
  if (!isSupabaseConfigured()) return sampleProjects().filter((p) => p.client_id === SAMPLE_CLIENT.id);
  scheduleSync();
  const supabase = await createClient();
  const { data, error } = await supabase.from("projects").select(PROJECT_COLUMNS)
    .eq("client_id", userId).is("deleted_at", null).order("created_at", { ascending: false });
  if (error) throw new Error("내 프로젝트를 불러오지 못했습니다.");
  return withCounts((data ?? []) as Row[]);
}

export async function listMyBookmarks(userId: string): Promise<Project[]> {
  if (!isSupabaseConfigured()) return sampleProjects().filter((p) => p.display_status === "recruiting").slice(0, 3);
  const supabase = await createClient();
  const { data, error } = await supabase.from("bookmarks")
    .select(`created_at, projects(${PROJECT_COLUMNS})`)
    .eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw new Error("북마크를 불러오지 못했습니다.");
  // 삭제된 프로젝트는 조회 규칙에 막혀 projects 가 비어 있으므로 건너뛴다.
  const rows = ((data ?? []) as unknown as { projects: Row | Row[] | null }[])
    .map((b) => (Array.isArray(b.projects) ? b.projects[0] : b.projects))
    .filter((p): p is Row => Boolean(p));
  return withCounts(rows);
}

export async function isBookmarked(userId: string, projectId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const supabase = await createClient();
  const { data } = await supabase.from("bookmarks").select("project_id").eq("user_id", userId).eq("project_id", projectId).maybeSingle();
  return Boolean(data);
}

export type { DisplayStatus };

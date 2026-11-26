"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/profile";
import { displayStatus } from "@/components/projects/model";
import { generateUnitEstimate } from "@/components/ai/generate-estimate";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ESTIMATE_RETRY_MESSAGE =
  "견적을 만들지 못했습니다. 빠진 칸이나 이상한 금액이 있어 저장하지 않았습니다. 다시 시도해 주세요.";

export type EstimateState = { error?: string };

function projectIdFrom(form: FormData) {
  const value = form.get("project_id");
  if (typeof value !== "string" || !uuidPattern.test(value)) return null;
  return value;
}

async function requireOwner(projectId: string) {
  const next = `/ai-estimate/${projectId}`;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  const { data: profile } = await supabase.from("profiles").select("role, name").eq("id", user.id).maybeSingle();
  if (!profile?.role) redirect(`/onboarding/role?next=${encodeURIComponent(next)}`);
  if (profile.role !== "client" || !profile.name?.trim()) {
    if (profile.role === "client") redirect(`/me/profile?next=${encodeURIComponent(next)}`);
    return { error: "이 프로젝트의 견적을 만들 수 없습니다." } as const;
  }

  const { data: project, error } = await supabase
    .from("projects")
    .select("id, client_id, description, budget, status, recruit_start_at, recruit_end_at")
    .eq("id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !project || project.client_id !== user.id) {
    return { error: "이 프로젝트의 견적을 만들 수 없습니다." } as const;
  }
  return { supabase, project } as const;
}

function refresh(projectId: string) {
  revalidatePath(`/ai-estimate/${projectId}`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/edit`);
  revalidatePath("/projects");
  revalidatePath("/me/projects");
}

export async function createEstimate(_prev: EstimateState, form: FormData): Promise<EstimateState> {
  if (!isSupabaseConfigured()) return { error: "데이터베이스가 연결되지 않아 저장하지 않았습니다. 다시 시도해 주세요." };
  const projectId = projectIdFrom(form);
  if (!projectId) return { error: ESTIMATE_RETRY_MESSAGE };
  const owner = await requireOwner(projectId);
  if ("error" in owner) return { error: owner.error };

  const generated = await generateUnitEstimate(owner.project.description ?? "");
  if (!generated.ok) {
    if (generated.reason === "short") {
      return { error: "프로젝트 설명이 너무 짧습니다. 설명을 10자 이상 저장한 뒤 다시 시도해 주세요." };
    }
    if (generated.reason === "not_ready") {
      return { error: "견적을 만들 준비가 되지 않았습니다. AI 연결을 확인한 뒤 다시 시도해 주세요." };
    }
    return { error: ESTIMATE_RETRY_MESSAGE };
  }

  const { error } = await owner.supabase.rpc("save_ai_estimate", {
    p_project_id: projectId,
    p_items: generated.value.items,
    p_total_amount: generated.value.total_amount,
  });
  if (error) {
    if (error.message.includes("ESTIMATE_INVALID")) return { error: ESTIMATE_RETRY_MESSAGE };
    if (error.code === "PGRST202" || error.message.includes("save_ai_estimate")) {
      return { error: "견적 저장 기능이 아직 데이터베이스에 없습니다. 0402 SQL을 실행한 뒤 다시 시도해 주세요." };
    }
    return { error: ESTIMATE_RETRY_MESSAGE };
  }

  refresh(projectId);
  redirect(`/ai-estimate/${projectId}`);
}

export async function applyEstimateToBudget(_prev: EstimateState, form: FormData): Promise<EstimateState> {
  if (!isSupabaseConfigured()) return { error: "데이터베이스가 연결되지 않아 예산을 바꾸지 않았습니다." };
  const projectId = projectIdFrom(form);
  if (!projectId) return { error: "예산을 바꾸지 못했습니다. 다시 시도해 주세요." };
  const owner = await requireOwner(projectId);
  if ("error" in owner) return { error: owner.error };

  const project = owner.project;
  const recruiting = project.status === "scheduled" || project.status === "recruiting";
  const stillOpen = displayStatus(project.status, project.recruit_start_at, project.recruit_end_at) !== "closed";
  if (!recruiting || !stillOpen) {
    return { error: "모집이 끝났거나 계약이 진행 중인 프로젝트는 예산을 바꿀 수 없습니다." };
  }

  const { data: counts, error: countError } = await owner.supabase.rpc("project_applicant_counts", {
    p_project_ids: [projectId],
  });
  if (countError) return { error: "지원자 수를 확인하지 못했습니다. 다시 시도해 주세요." };
  const applicantCount = Number((counts as { applicant_count?: number }[] | null)?.[0]?.applicant_count ?? 0);
  if (applicantCount > 0) return { error: "지원자가 있어서 예산은 바꿀 수 없습니다." };

  const { data: estimate, error: estimateError } = await owner.supabase
    .from("ai_estimates")
    .select("total_amount")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (estimateError || !estimate) return { error: "저장된 참고 견적이 없어 예산을 바꾸지 않았습니다." };

  const total = Number(estimate.total_amount);
  if (!Number.isSafeInteger(total) || total < 10_000) {
    return { error: "저장된 총액이 이상해 예산을 바꾸지 않았습니다. 다시 시도해 주세요." };
  }

  const { error } = await owner.supabase
    .from("projects")
    .update({ budget: total })
    .eq("id", projectId)
    .eq("client_id", project.client_id);
  if (error) {
    if (error.message.includes("HAS_APPLICANTS")) return { error: "지원자가 있어서 예산은 바꿀 수 없습니다." };
    return { error: "예산을 바꾸지 못했습니다. 다시 시도해 주세요." };
  }

  refresh(projectId);
  redirect(`/ai-estimate/${projectId}`);
}

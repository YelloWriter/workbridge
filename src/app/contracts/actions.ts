"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/profile";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ContractActionState = { error?: string };

function readId(form: FormData, key: string) {
  const value = form.get(key);
  if (typeof value !== "string" || !uuidPattern.test(value)) return null;
  return value;
}

function message(error: { message: string; code?: string }) {
  const text = error.message;
  if (error.code === "PGRST202" || text.includes("agree_contract_amount") || text.includes("decline_contract_amount") || text.includes("sign_contract")) {
    return "계약 기능이 아직 데이터베이스에 없습니다. 0403 SQL을 실행한 뒤 다시 시도해 주세요.";
  }
  if (text.includes("NOT_THE_FREELANCER")) return "선정된 프리랜서만 동의하거나 거부할 수 있습니다.";
  if (text.includes("CONTRACT_ALREADY_CREATED")) return "이미 계약서가 만들어진 뒤에는 거부할 수 없습니다.";
  if (text.includes("PROJECT_NOT_IN_CONTRACT")) return "계약 대기 중인 프로젝트에서만 할 수 있습니다.";
  if (text.includes("APPLICATION_NOT_ACCEPTED")) return "수락된 지원만 동의하거나 거부할 수 있습니다.";
  if (text.includes("AMOUNT_MISSING")) return "수락할 때 저장된 합의 금액이 없습니다.";
  if (text.includes("NOT_A_PARTY")) return "이 계약의 당사자만 서명할 수 있습니다.";
  if (text.includes("CONTRACT_NOT_SIGNING")) return "서명할 수 있는 계약이 아닙니다.";
  if (text.includes("CONTRACT_NOT_FOUND") || text.includes("APPLICATION_NOT_FOUND")) return "대상을 찾지 못했습니다.";
  return "처리하지 못했습니다. 다시 시도해 주세요.";
}

async function requireUser(next: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  const { data: profile } = await supabase.from("profiles").select("role, name").eq("id", user.id).maybeSingle();
  if (!profile?.role) redirect(`/onboarding/role?next=${encodeURIComponent(next)}`);
  if (!profile.name?.trim()) redirect(`/me/profile?next=${encodeURIComponent(next)}`);
  return { supabase, user };
}

function refresh(projectId?: string, contractId?: string) {
  revalidatePath("/contracts");
  revalidatePath("/notifications");
  revalidatePath("/me/applications");
  if (contractId) revalidatePath(`/contracts/${contractId}`);
  if (projectId) {
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/applicants`);
  }
}

export async function agreeToAmount(_prev: ContractActionState, form: FormData): Promise<ContractActionState> {
  if (!isSupabaseConfigured()) return { error: "데이터베이스가 연결되지 않아 저장하지 않았습니다." };
  const applicationId = readId(form, "application_id");
  if (!applicationId) return { error: "올바른 지원이 아닙니다." };
  const { supabase } = await requireUser("/contracts");
  const { data: application } = await supabase.from("applications").select("project_id").eq("id", applicationId).maybeSingle();
  const { data, error } = await supabase.rpc("agree_contract_amount", { p_application_id: applicationId });
  if (error || !data) return { error: error ? message(error) : "계약서를 만들지 못했습니다. 다시 시도해 주세요." };
  refresh(application?.project_id, data as string);
  redirect(`/contracts/${data}`);
}

export async function declineAmount(_prev: ContractActionState, form: FormData): Promise<ContractActionState> {
  if (!isSupabaseConfigured()) return { error: "데이터베이스가 연결되지 않아 저장하지 않았습니다." };
  const applicationId = readId(form, "application_id");
  if (!applicationId) return { error: "올바른 지원이 아닙니다." };
  const { supabase } = await requireUser("/contracts");
  const { data: application } = await supabase.from("applications").select("project_id").eq("id", applicationId).maybeSingle();
  const { error } = await supabase.rpc("decline_contract_amount", { p_application_id: applicationId });
  if (error) return { error: message(error) };
  refresh(application?.project_id);
  redirect("/contracts");
}

export async function signContract(_prev: ContractActionState, form: FormData): Promise<ContractActionState> {
  if (!isSupabaseConfigured()) return { error: "데이터베이스가 연결되지 않아 저장하지 않았습니다." };
  const contractId = readId(form, "contract_id");
  if (!contractId) return { error: "올바른 계약이 아닙니다." };
  if (form.get("confirm") !== "on") return { error: "내용을 확인했다면 서명 칸을 체크해 주세요." };
  const { supabase } = await requireUser(`/contracts/${contractId}`);
  const { data: contract } = await supabase.from("contracts").select("project_id").eq("id", contractId).maybeSingle();
  const { error } = await supabase.rpc("sign_contract", { p_contract_id: contractId });
  if (error) return { error: message(error) };
  refresh(contract?.project_id, contractId);
  redirect(`/contracts/${contractId}`);
}

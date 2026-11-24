"use server";
import { revalidatePath } from "next/cache";
import { requireMember, isSupabaseConfigured } from "@/components/applications/server";
import { rpcError, uuidPattern, type ActionState } from "@/components/applications/model";

export async function decideApplication(projectId: string, applicationId: string, decision: "accept" | "reject",
  _previous: ActionState, form: FormData): Promise<ActionState> {
  if (!isSupabaseConfigured()) return { error: "서비스 연결을 준비하고 있습니다." };
  if (!uuidPattern.test(projectId) || !uuidPattern.test(applicationId) || !["accept", "reject"].includes(decision)) return { error: "올바른 요청이 아닙니다." };
  const { supabase, user, profile } = await requireMember(`/projects/${projectId}/applicants`);
  if (profile.role !== "client") return { error: "의뢰인만 처리할 수 있습니다." };
  const { data: project, error: projectError } = await supabase.from("projects").select("client_id").eq("id", projectId).is("deleted_at", null).maybeSingle();
  if (projectError || !project || project.client_id !== user.id) return { error: "본인이 등록한 프로젝트만 처리할 수 있습니다." };
  const { data: application } = await supabase.from("applications").select("id").eq("id", applicationId).eq("project_id", projectId).maybeSingle();
  if (!application) return { error: "지원서를 찾을 수 없습니다." };
  const amount = Number(form.get("agreed_amount"));
  if (decision === "accept" && (!Number.isSafeInteger(amount) || amount < 1 || amount > 999999999999)) return { error: "계약 협의를 시작할 금액을 1원 이상의 정수로 입력해 주세요." };
  const { error } = decision === "accept"
    ? await supabase.rpc("accept_application", { p_application_id: applicationId, p_agreed_amount: amount })
    : await supabase.rpc("reject_application", { p_application_id: applicationId });
  if (error) return { error: rpcError(error.message) };
  revalidatePath(`/projects/${projectId}/applicants`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/me/applications");
  revalidatePath("/notifications");
  return {};
}

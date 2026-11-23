"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMember, isSupabaseConfigured } from "@/components/applications/server";
import { isProfileComplete, rpcError, uuidPattern, type ActionState } from "@/components/applications/model";

export async function submitApplication(projectId: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  if (!isSupabaseConfigured()) return { error: "서비스 연결을 준비하고 있습니다." };
  if (!uuidPattern.test(projectId)) return { error: "올바른 프로젝트가 아닙니다." };
  const path = `/projects/${projectId}/apply`;
  const { supabase, profile } = await requireMember(path);
  if (profile.role !== "freelancer") return { error: "프리랜서 계정으로 지원해 주세요." };
  if (!isProfileComplete(profile)) redirect(`/me/profile?next=${encodeURIComponent(path)}`);
  const coverLetter = String(form.get("cover_letter") ?? "").trim();
  const amount = Number(form.get("proposed_amount"));
  const days = Number(form.get("proposed_days"));
  if (!coverLetter || coverLetter.length > 5000 || !Number.isSafeInteger(amount) || amount < 1 || amount > 999999999999
    || !Number.isInteger(days) || days < 1 || days > 3650) return { error: "자기소개는 1~5,000자, 금액은 1원 이상 정수, 기간은 1~3,650일로 입력해 주세요." };
  const { error } = await supabase.rpc("submit_application", {
    p_project_id: projectId, p_cover_letter: coverLetter, p_proposed_amount: amount, p_proposed_days: days,
  });
  if (error?.message.includes("PROFILE_INCOMPLETE")) redirect(`/me/profile?next=${encodeURIComponent(path)}`);
  if (error) return { error: rpcError(error.message) };
  revalidatePath("/me/applications");
  revalidatePath(`/projects/${projectId}/applicants`);
  revalidatePath("/notifications");
  redirect("/me/applications");
}

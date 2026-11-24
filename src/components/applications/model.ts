export const statusLabels = { pending: "검토중", accepted: "수락", rejected: "거절" } as const;
export const reasonLabels = {
  manual: "의뢰인이 직접 거절했습니다.",
  auto: "다른 지원자가 선정되었습니다.",
  closed: "프로젝트 모집이 마감되었습니다.",
  negotiation_failed: "금액 합의가 성사되지 않았습니다.",
} as const;

export type Application = {
  id: string; project_id: string; freelancer_id: string; cover_letter: string;
  proposed_amount: number; proposed_days: number; status: keyof typeof statusLabels;
  reject_reason: keyof typeof reasonLabels | null; accepted_agreed_amount: number | null;
  created_at: string;
};
export type ActionState = { error?: string; success?: string };
export type ApplyState = ActionState & { values?: { coverLetter: string; amount: string; days: string } };
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isProfileComplete(profile: { name?: string | null }) {
  return Boolean(profile.name?.trim());
}
export function money(amount: number) { return `${Number(amount).toLocaleString("ko-KR")}원`; }
export function dateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value));
}
export function rpcError(message: string) {
  const errors: Record<string, string> = {
    AUTH_REQUIRED: "로그인한 후 다시 시도해 주세요.",
    FREELANCER_REQUIRED: "프리랜서 계정으로 지원할 수 있습니다.",
    OWNER_REQUIRED: "이 프로젝트를 등록한 의뢰인만 처리할 수 있습니다.",
    PROJECT_NOT_FOUND: "프로젝트를 찾을 수 없습니다.",
    APPLICATION_NOT_FOUND: "지원서를 찾을 수 없습니다.",
    PROFILE_INCOMPLETE: "지원하려면 먼저 내 프로필을 완성해 주세요.",
    RECRUITMENT_CLOSED: "현재 지원 또는 지원자 결정을 할 수 없는 프로젝트입니다.",
    ALREADY_APPLIED: "이미 지원한 프로젝트입니다. 내 지원 현황을 확인해 주세요.",
    APPLICATION_ALREADY_DECIDED: "이미 결과가 결정된 지원서입니다. 화면을 새로고침해 주세요.",
    INVALID_INPUT: "금액, 기간과 자기소개를 다시 확인해 주세요.",
    APPLICANT_UNAVAILABLE: "현재 활동하지 않는 지원자입니다. 다른 지원자를 확인해 주세요.",
  };
  return Object.entries(errors).find(([code]) => message.includes(code))?.[1]
    ?? "처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

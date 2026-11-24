// 2번(프로젝트) 공용: 타입, 한글 이름표, 입력 검사, 날짜·금액 표시.
// 화면 이름표와 상태값은 docs/TEAM.md 2장 그대로입니다.
import { CATEGORIES, SKILLS } from "@/lib/constants";

export type DisplayStatus = "scheduled" | "recruiting" | "closed";

/** 외부 목록·상세에 보이는 상태. 모집 예정·모집 중 외에는 모두 "모집 마감" (TEAM.md) */
export const displayStatusLabels: Record<DisplayStatus, string> = {
  scheduled: "모집 예정",
  recruiting: "모집 중",
  closed: "모집 마감",
};

/** 의뢰인의 "내 프로젝트"에서 보이는 거래 단계 상태 (TEAM.md 의 projects.status 전체) */
export const dealStatusLabels: Record<string, string> = {
  scheduled: "모집 예정",
  recruiting: "모집 중",
  closed: "모집 마감",
  contract_pending: "계약 대기",
  in_progress: "작업 중",
  delivered: "납품 요청",
  completed: "완료",
  cancelled: "취소",
};

export type Project = {
  id: string;
  client_id: string;
  title: string;
  description: string;
  category: string;
  skills: string[];
  budget: number;
  recruit_start_at: string;
  recruit_end_at: string;
  status: string;
  display_status: DisplayStatus;
  created_at: string;
  applicant_count: number;
};

export const PROJECT_COLUMNS =
  "id, client_id, title, description, category, skills, budget, recruit_start_at, recruit_end_at, status, created_at";

/** DB 의 status 가 시간을 아직 못 따라갔어도, 시간을 기준으로 화면 상태를 맞춘다. (0202 의 project_display_status 와 같은 규칙) */
export function displayStatus(status: string, start: string, end: string, now = Date.now()): DisplayStatus {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (status === "scheduled" && s > now) return "scheduled";
  if ((status === "scheduled" || status === "recruiting") && e > now) return "recruiting";
  return "closed";
}

/** 내 프로젝트 화면의 상태 이름. 모집 단계는 시간 기준으로 맞추고, 그 뒤 단계는 DB 값 그대로. */
export function dealStatusLabel(project: Pick<Project, "status" | "recruit_start_at" | "recruit_end_at">, now = Date.now()) {
  if (["scheduled", "recruiting", "closed"].includes(project.status)) {
    return displayStatusLabels[displayStatus(project.status, project.recruit_start_at, project.recruit_end_at, now)];
  }
  return dealStatusLabels[project.status] ?? project.status;
}

// ---------- 목록 검색 조건 ----------

export const PAGE_SIZE = 10;
export type SortKey = "latest" | "deadline" | "budget";
export const sortLabels: Record<SortKey, string> = {
  latest: "최신순",
  deadline: "마감 임박순",
  budget: "예산 높은순",
};

export type ListParams = {
  q: string;
  category: string;
  skills: string[];
  budgetMin: number | null;
  budgetMax: number | null;
  deadlineFrom: string; // YYYY-MM-DD (한국 날짜)
  deadlineTo: string;
  status: DisplayStatus | "";
  sort: SortKey;
  page: number;
};

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
function toInt(value: string | undefined) {
  if (!value || !/^\d{1,13}$/.test(value.trim())) return null;
  return Number(value.trim());
}

export function isDateString(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** 주소의 ? 뒤 값을 믿지 않고 하나씩 검사해서 안전한 값만 남긴다. */
export function parseListParams(raw: RawParams): ListParams {
  const rawSkills = raw.skills === undefined ? [] : Array.isArray(raw.skills) ? raw.skills : [raw.skills];
  const category = first(raw.category) ?? "";
  const status = first(raw.status) ?? "";
  const sort = first(raw.sort) ?? "latest";
  const from = first(raw.deadline_from) ?? "";
  const to = first(raw.deadline_to) ?? "";
  const page = toInt(first(raw.page)) ?? 1;
  return {
    q: (first(raw.q) ?? "").trim().slice(0, 100),
    category: (CATEGORIES as readonly string[]).includes(category) ? category : "",
    skills: [...new Set(rawSkills.filter((s): s is string => (SKILLS as readonly string[]).includes(s)))],
    budgetMin: toInt(first(raw.budget_min)),
    budgetMax: toInt(first(raw.budget_max)),
    deadlineFrom: isDateString(from) ? from : "",
    deadlineTo: isDateString(to) ? to : "",
    status: status === "scheduled" || status === "recruiting" || status === "closed" ? status : "",
    sort: sort === "deadline" || sort === "budget" ? sort : "latest",
    page: Math.min(Math.max(page, 1), 1000),
  };
}

/** 목록 주소 만들기. 기본값과 같은 항목은 주소에서 뺀다. */
export function listHref(params: ListParams, overrides: Partial<ListParams> = {}) {
  const p = { ...params, ...overrides };
  const query = new URLSearchParams();
  if (p.q) query.set("q", p.q);
  if (p.category) query.set("category", p.category);
  for (const s of p.skills) query.append("skills", s);
  if (p.budgetMin !== null) query.set("budget_min", String(p.budgetMin));
  if (p.budgetMax !== null) query.set("budget_max", String(p.budgetMax));
  if (p.deadlineFrom) query.set("deadline_from", p.deadlineFrom);
  if (p.deadlineTo) query.set("deadline_to", p.deadlineTo);
  if (p.status) query.set("status", p.status);
  if (p.sort !== "latest") query.set("sort", p.sort);
  if (p.page > 1) query.set("page", String(p.page));
  const text = query.toString();
  return text ? `/projects?${text}` : "/projects";
}

/** 활성화된 필터 개수 (검색어·정렬·페이지는 제외) */
export function activeFilterCount(p: ListParams) {
  return [p.category, p.skills.length, p.budgetMin !== null, p.budgetMax !== null, p.deadlineFrom, p.deadlineTo, p.status].filter(Boolean).length;
}

// ---------- 날짜·금액 (한국 시간 기준) ----------

/** 지금 시각(밀리초). 화면은 요청마다 서버에서 새로 그려지므로(connection()) 읽어도 안전합니다. */
export function currentTime() {
  return Date.now();
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function kstDate(iso: string | number | Date) {
  return new Date(new Date(iso).getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}
export const kstDayStart = (date: string) => `${date}T00:00:00+09:00`;
export const kstDayEnd = (date: string) => `${date}T23:59:59+09:00`;

export function formatDate(iso: string) {
  const [y, m, d] = kstDate(iso).split("-");
  return `${y}.${m}.${d}.`;
}

export function money(amount: number) {
  return amount > 0 ? `${Number(amount).toLocaleString("ko-KR")}원` : "예산 협의";
}

/** "마감까지 N일" 같은 남은 기간 글 */
export function remainingText(end: string, now = Date.now()) {
  const left = new Date(end).getTime() - now;
  if (left <= 0) return "마감";
  const days = Math.floor(left / 86_400_000);
  if (days >= 1) return `마감까지 ${days}일`;
  const hours = Math.floor(left / 3_600_000);
  return hours >= 1 ? `마감까지 ${hours}시간` : "곧 마감";
}

export function isNew(createdAt: string, now = Date.now()) {
  return now - new Date(createdAt).getTime() < 3 * 86_400_000;
}

// ---------- 등록·수정 입력 검사 ----------

export type ProjectInput = {
  title: string;
  description: string;
  category: string;
  skills: string[];
  budget: number;
  startDate: string;
  endDate: string;
};
export type FormState = { error?: string; message?: string };
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MAX_BUDGET = 999_999_999_999;

export function parseProjectForm(form: FormData): { ok: true; value: ProjectInput } | { ok: false; error: string } {
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const title = text("title");
  const description = text("description");
  const category = text("category");
  const skills = [...new Set(form.getAll("skills").map(String))];
  const budgetText = text("budget").replace(/,/g, "");
  const startDate = text("start_date");
  const endDate = text("end_date");

  if (title.length < 2 || title.length > 100) return { ok: false, error: "제목은 2~100자로 입력해 주세요." };
  if (description.length < 10 || description.length > 5000) return { ok: false, error: "설명은 10~5,000자로 입력해 주세요." };
  if (!(CATEGORIES as readonly string[]).includes(category)) return { ok: false, error: "카테고리를 선택해 주세요." };
  if (skills.length > 10 || skills.some((s) => !(SKILLS as readonly string[]).includes(s))) {
    return { ok: false, error: "기술 스택은 목록에서 최대 10개까지 고를 수 있습니다." };
  }
  if (!/^\d{1,12}$/.test(budgetText) || Number(budgetText) > MAX_BUDGET) {
    return { ok: false, error: "예산은 0 이상의 숫자(원 단위)로 입력해 주세요." };
  }
  if (!isDateString(startDate) || !isDateString(endDate)) return { ok: false, error: "모집 시작일과 마감일을 선택해 주세요." };
  if (endDate < startDate) return { ok: false, error: "모집 마감일은 시작일보다 같거나 뒤여야 합니다." };
  return { ok: true, value: { title, description, category, skills, budget: Number(budgetText), startDate, endDate } };
}

/** DB 와 서버 동작에서 올라오는 영어 오류 이름을 쉬운 한국어로 */
export function projectErrorText(message: string) {
  const errors: [string, string][] = [
    ["HAS_APPLICANTS_CLOSE_FIRST", "지원자가 있는 프로젝트는 먼저 모집을 마감한 뒤 삭제할 수 있습니다."],
    ["HAS_APPLICANTS", "지원자가 있는 프로젝트는 예산과 모집 마감일을 바꿀 수 없습니다."],
    ["cannot delete this project", "삭제할 수 없는 프로젝트입니다. 계약이 진행 중이거나 이미 삭제된 프로젝트일 수 있습니다."],
    ["OWNER_REQUIRED", "이 프로젝트를 등록한 의뢰인만 처리할 수 있습니다."],
    ["PROJECT_NOT_FOUND", "프로젝트를 찾을 수 없습니다."],
    ["INVALID_PROJECT_STATUS", "모집 중인 프로젝트만 마감할 수 있습니다."],
    ["NOT_DUE", "아직 모집 마감일이 되지 않았습니다."],
  ];
  return errors.find(([code]) => message.includes(code))?.[1] ?? "처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

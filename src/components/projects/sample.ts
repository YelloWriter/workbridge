// Supabase 키를 받기 전에 화면을 확인하려고 쓰는 가짜 데이터입니다.
// 키(.env.local)가 들어오면 이 파일은 쓰이지 않습니다. 저장은 되지 않습니다.
import {
  displayStatus, PAGE_SIZE,
  type ListParams, type Project,
} from "./model";

export const SAMPLE_CLIENT = {
  id: "00000000-0000-4000-8000-0000000000c1",
  name: "한지민",
  company_name: "한가람",
  business_field: "쇼핑",
};

const DAY = 86_400_000;

type Seed = [string, string, string, string[], number, number, number, string, number];
// [제목, 설명, 카테고리, 기술, 예산, 시작(오늘 기준 일), 마감(오늘 기준 일), DB 상태, 지원자 수]
const seeds: Seed[] = [
  ["쇼핑몰 상품 목록 화면 제작", "상품 목록, 상세, 장바구니 화면을 만들어 주세요. 기존 디자인 시안이 있습니다.", "웹 개발", ["React", "Next.js", "TypeScript"], 3_000_000, -3, 12, "recruiting", 4],
  ["매장 예약 앱 개발", "매장 예약과 알림 기능이 있는 모바일 앱을 만들고 싶습니다.", "앱 개발", ["Kotlin", "Swift"], 8_000_000, 2, 20, "scheduled", 0],
  ["판매 수치 대시보드", "일별 판매 수치를 보여주는 관리자 대시보드가 필요합니다.", "데이터·AI", ["Python", "SQL"], 2_500_000, -6, 5, "recruiting", 7],
  ["브랜드 로고와 명함 디자인", "신규 카페 브랜드의 로고, 명함, 메뉴판 디자인을 의뢰합니다.", "디자인", ["Figma"], 800_000, -10, 1, "recruiting", 12],
  ["서비스 기획서 정리", "흩어진 아이디어를 화면 흐름과 기능 목록이 있는 기획서로 정리해 주세요.", "기획", [], 1_200_000, -4, 9, "recruiting", 2],
  ["회사 소개 홈페이지", "회사 소개와 문의 폼이 있는 반응형 홈페이지를 제작해 주세요.", "웹 개발", ["HTML/CSS", "JavaScript", "PHP"], 1_800_000, -20, -8, "closed", 9],
  ["재고 관리 웹 서비스", "엑셀로 관리하던 재고를 웹에서 관리하고 싶습니다.", "웹 개발", ["Node.js", "SQL", "React"], 6_500_000, -30, -20, "in_progress", 5],
  ["AI 챗봇 상담 도입", "고객 문의 답변 초안을 만들어 주는 챗봇을 붙이고 싶습니다.", "데이터·AI", ["Python", "TypeScript"], 0, 5, 30, "scheduled", 0],
  ["모바일 앱 UI 리디자인", "기존 앱의 화면을 새롭게 디자인해 주세요.", "디자인", ["Figma"], 2_000_000, -2, 14, "recruiting", 3],
  ["사내 교육 플랫폼 화면", "강의 목록과 수강 현황 화면이 필요합니다.", "웹 개발", ["Vue", "TypeScript"], 4_200_000, -1, 18, "recruiting", 1],
  ["배달 앱 사장님 화면", "사장님용 주문 확인 앱입니다.", "앱 개발", ["Kotlin"], 5_500_000, -5, 7, "recruiting", 6],
];

export function sampleProjects(now = Date.now()): Project[] {
  return seeds.map(([title, description, category, skills, budget, startDay, endDay, status, applicants], i) => {
    const start = new Date(now + startDay * DAY).toISOString();
    const end = new Date(now + endDay * DAY).toISOString();
    return {
      id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      client_id: SAMPLE_CLIENT.id,
      title, description, category, skills, budget, status,
      recruit_start_at: start,
      recruit_end_at: end,
      display_status: displayStatus(status, start, end, now),
      created_at: new Date(now - (seeds.length - i) * DAY * 0.7).toISOString(),
      applicant_count: applicants,
    };
  });
}

/** 가짜 데이터에서 SQL(search_projects)과 같은 규칙으로 걸러내고 정렬한다. */
export function sampleSearch(params: ListParams, perPage = PAGE_SIZE, now = Date.now()) {
  const q = params.q.toLowerCase();
  const from = params.deadlineFrom ? new Date(`${params.deadlineFrom}T00:00:00+09:00`).getTime() : null;
  const to = params.deadlineTo ? new Date(`${params.deadlineTo}T23:59:59+09:00`).getTime() : null;
  const rows = sampleProjects(now).filter((p) => {
    const end = new Date(p.recruit_end_at).getTime();
    return (!q || p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
      && (!params.category || p.category === params.category)
      && (params.budgetMin === null || p.budget >= params.budgetMin)
      && (params.budgetMax === null || p.budget <= params.budgetMax)
      && (!params.skills.length || p.skills.some((s) => params.skills.includes(s)))
      && (from === null || end >= from)
      && (to === null || end <= to)
      && (!params.status || p.display_status === params.status);
  });
  const closedLast = (p: Project) => (p.display_status === "closed" ? 1 : 0);
  rows.sort((a, b) => {
    if (params.sort === "budget" && b.budget !== a.budget) return b.budget - a.budget;
    if (params.sort === "deadline") {
      const diff = closedLast(a) - closedLast(b) || new Date(a.recruit_end_at).getTime() - new Date(b.recruit_end_at).getTime();
      if (diff) return diff;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  const start = (params.page - 1) * perPage;
  return { items: rows.slice(start, start + perPage), total: rows.length };
}

export function sampleFind(id: string) {
  return sampleProjects().find((p) => p.id === id) ?? null;
}

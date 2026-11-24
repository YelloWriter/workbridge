import "server-only";
import { createClient } from "@supabase/supabase-js";

// 상태 자동 전환 (TEAM.md: 2번 담당)
//   모집 시작일이 되면   scheduled  → recruiting
//   모집 마감일이 지나면 recruiting → closed
// 마감할 때 처리 안 된 지원 일괄 거절과 알림은 3번의 close_project_applications 함수가 합니다.
// 이 함수는 3번 함수를 부르기만 하고, projects.status 를 직접 closed 로 바꾸지 않습니다.
//
// 실행 방식: 사람이 목록·상세·홈·내 프로젝트를 볼 때마다 응답이 끝난 뒤 실행합니다 (30초에 한 번까지).
// 아무도 접속하지 않으면 실행되지 않지만, 화면의 상태 글자는 시간을 기준으로 계산하므로 틀리게 보이지는 않습니다.

let lastRun = 0;
const MIN_GAP_MS = 30_000;

export async function syncProjectStatuses() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  if (Date.now() - lastRun < MIN_GAP_MS) return;
  lastRun = Date.now();

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const now = new Date().toISOString();

  try {
    // 시작일이 된 모집 예정 → 모집 중 (아직 마감일 전인 것만)
    const started = await admin.from("projects").update({ status: "recruiting" })
      .eq("status", "scheduled").lte("recruit_start_at", now).gt("recruit_end_at", now).is("deleted_at", null);
    if (started.error) console.error("[projects sync] 모집 시작 전환 실패:", started.error.message);

    // 시작도 못 하고 마감일이 지난 모집 예정 → 모집 마감 (지원자가 있을 수 없음)
    const expired = await admin.from("projects").update({ status: "closed" })
      .eq("status", "scheduled").lte("recruit_end_at", now).is("deleted_at", null);
    if (expired.error) console.error("[projects sync] 만료 전환 실패:", expired.error.message);

    // 마감일이 지난 모집 중 → 3번 함수로 마감 (지원 일괄 거절 + 알림 포함)
    const due = await admin.from("projects").select("id")
      .eq("status", "recruiting").lte("recruit_end_at", now).is("deleted_at", null).limit(50);
    if (due.error) {
      console.error("[projects sync] 마감 대상 조회 실패:", due.error.message);
      return;
    }
    for (const row of due.data ?? []) {
      const closed = await admin.rpc("close_project_applications", { p_project_id: row.id });
      if (closed.error) console.error("[projects sync] 마감 처리 실패:", row.id, closed.error.message);
    }
  } catch (error) {
    console.error("[projects sync] 예기치 못한 오류:", error);
  }
}

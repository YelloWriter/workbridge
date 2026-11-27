# 2번 기능 명세서 (기능 목록)

- 범위: 프로젝트 **등록 · 목록 · 검색 · 필터 · 상세 · 북마크 · 추천 · 홈 화면**
- 담당: 2번 / 브랜치 `feat/2-projects` / 작성: 2026-11-25
- 이 문서는 "무엇을 만들었나"를 한눈에 보는 목록입니다. 기능마다 화면 구성, 입력 규칙, 오류 문구, 확인 기준은 **세부 명세서** `docs/specs/2-projects-detail-spec.md` 에 있습니다.
- 서버 동작과 DB 전체 설명은 `docs/specs/2-projects.md`, 위시켓 분석은 `docs/rea/2-projects.md`.

## 1. 기능 목록

| ID | 기능 | 하는 일 | 화면 주소 | 쓰는 사람 | 구현 | 확인 |
| --- | --- | --- | --- | --- | --- | --- |
| F-01 | 홈 화면 | 검색창, 카테고리 버튼 5개, 최신 프로젝트 6개를 보여 줍니다 | `/` | 누구나 | 완료 | ◎ 2 · ○ 3 · △ 1 (총 6) |
| F-02 | 프로젝트 등록 | 제목·설명·카테고리 → 모집 시작일·마감일·예산 → 기술 스택, 3단계로 등록합니다 | `/projects/new` | 의뢰인 | 완료 | ◎ 9 · ○ 5 · △ 1 (총 15) |
| F-03 | 프로젝트 목록 | 프로젝트를 카드로 보여 주고, 정렬(3종)과 10개씩 페이지 이동을 제공합니다 | `/projects` | 누구나 | 완료 | ◎ 4 · ○ 6 · △ 0 (총 10) |
| F-04 | 키워드 검색 | 제목과 설명에서 키워드를 찾습니다 | `/` , `/projects` | 누구나 | 완료 | ◎ 2 · ○ 3 · △ 1 (총 6) |
| F-05 | 필터 | 카테고리, 예산 범위, 기술 스택, 모집 마감일, 모집 상태로 좁힙니다 | `/projects` | 누구나 | 완료 | ◎ 2 · ○ 6 · △ 1 (총 9) |
| F-06 | 프로젝트 상세 | 정보, 지원자 수, 상태, 의뢰인, 지원·북마크 버튼을 보여 줍니다 | `/projects/[id]` | 누구나 | 완료 | ◎ 9 · ○ 3 · △ 3 (총 15) |
| F-07 | 북마크 | 프리랜서가 프로젝트를 북마크하고 내 북마크에서 모아 봅니다 | `/projects/[id]`, `/me/bookmarks` | 프리랜서 | 완료 | ◎ 9 · ○ 1 · △ 2 (총 12) |
| F-08 | 추천 프로젝트 | 상세 아래에 같은 카테고리·비슷한 기술의 모집 중 프로젝트를 보여 줍니다 | `/projects/[id]` | 누구나 | 완료 | ◎ 2 · ○ 1 · △ 2 (총 5) |

- **구현 "완료":** 코드가 있고 `npm run build` 가 통과합니다.
- **확인:** 세부 명세서의 "확인 기준"을 센 결과입니다. ◎ 팀 공용 DB에서 시연 계정(의뢰인·프리랜서)이나 비로그인으로 실제 확인 / ○ 가짜 데이터 화면 시험이나 임시 DB 시험에서 확인 / △ 확인하지 못했고 코드로만 확인. **△ 가 있는 기능은 아직 완전히 확인된 것이 아닙니다.** 어떤 항목이 △ 인지는 세부 명세서에 하나씩 적었습니다.

## 2. 공통 규칙 (모든 기능에 적용)

| ID | 규칙 |
| --- | --- |
| C-01 | **모집 상태 표시:** `scheduled` = 모집 예정, `recruiting` = 모집 중, **그 밖의 모든 상태는 "모집 마감"** (TEAM.md). 화면은 시간 기준으로 계산하므로 DB 상태가 늦어도 맞게 보입니다. |
| C-02 | **날짜는 한국 시간.** 마감일은 그날 밤 23:59:59 까지입니다. |
| C-03 | **예산은 원 단위.** 0원이면 "예산 협의"로 보입니다. |
| C-04 | **주소(`?`) 값은 믿지 않고 하나씩 검사**하며, 잘못된 값은 버리고 기본값을 씁니다. |
| C-05 | **삭제된 프로젝트는 어디에도 보이지 않습니다.** |
| C-06 | **미리보기 모드:** `.env.local` 에 Supabase 주소·키가 없으면 가짜 데이터가 보이고(노란 안내 띠) 저장은 되지 않습니다. |
| C-07 | **조회가 실패하면** 오류 원문 대신 "불러오지 못했습니다" 화면과 "다시 시도" 버튼을 보여 줍니다. |

## 3. 다른 번호와 만나는 곳

| 이 기능이 | 만나는 곳 | 담당 |
| --- | --- | --- |
| F-02 등록 | 의뢰인 이름이 비어 있으면 `/me/profile?next=/projects/new` 로 보냄 | 1번 |
| F-02 등록 | 예산 칸 옆 "AI 단가 분석" 버튼 자리(`data-slot="ai-estimate-button"`), 지금은 눌리지 않음 | 4번이 연결 |
| F-06 상세 | "지원하기" → `/projects/[id]/apply`, "지원자 보기" → `/projects/[id]/applicants` | 3번 |
| F-06 상세 | 의뢰인 이름 → 공개 프로필 `/users/[id]` | 1번 |
| F-06 상세 | 지원자 수는 `project_applicant_counts` 로 읽음(숫자만) | 2번 DB, 지원 테이블은 3번 |

## 4. 이 문서의 범위 밖

프로젝트 수정·삭제, 모집 마감 버튼, 상태 자동 전환, 내 프로젝트 화면은 이 문서에 넣지 않았습니다. 상세 화면에서 의뢰인 본인에게 "수정"·"모집 마감" 버튼이 보인다는 사실만 F-06 에 적었고, 그 동작은 `docs/specs/2-projects.md` 에 있습니다.

## 5. 기능과 코드·DB 연결

| ID | 화면·서버 코드 | DB |
| --- | --- | --- |
| F-01 | `src/app/page.tsx` | `search_projects` |
| F-02 | `src/app/projects/new/page.tsx`, `src/components/projects/project-form.tsx`, `src/app/projects/actions.ts`(`createProject`) | `projects`(등록 규칙 RLS) |
| F-03 | `src/app/projects/page.tsx`, `src/components/projects/ui.tsx`(카드·페이지 이동) | `search_projects`, `project_display_status`, `project_applicant_counts` |
| F-04 | `src/components/projects/filters.tsx`, `src/app/page.tsx` | `search_projects`(`p_q`) |
| F-05 | `src/components/projects/filters.tsx`, `src/components/projects/model.ts`(`parseListParams`) | `search_projects` |
| F-06 | `src/app/projects/[id]/page.tsx` | `projects`, `profiles`(공개 칸만), `project_applicant_counts` |
| F-07 | `src/app/projects/actions.ts`(`toggleBookmark`), `src/app/me/bookmarks/page.tsx`, `src/components/projects/action-button.tsx` | `bookmarks`(본인만 RLS) |
| F-08 | `src/components/projects/server.ts`(`getRecommended`) | `search_projects` 2회 |

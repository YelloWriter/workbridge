# 2번 기능 명세: 프로젝트 등록·탐색·북마크·추천·홈

- 담당: 2번 / 브랜치 `feat/2-projects` / DB 번호 `0200`~`0299`
- 근거: `docs/TEAM.md` 1~4장. 아래에서 **[TEAM]** 은 TEAM.md에 이미 정해진 것, **[제안]** 은 이 문서에서 처음 정한 것입니다.
- 위시켓 분석(`docs/rea/2-projects.md`)은 아직 없습니다. 필터·카드 항목 중 **[REA 후 확정]** 표시는 분석 결과를 본 뒤 맞춥니다.

## 1. 화면

| 주소 | 화면 | 누가 볼 수 있나 |
| --- | --- | --- |
| `/` | 홈: 검색창, 카테고리 버튼, 추천/최신 프로젝트 [TEAM: 검색창·카테고리 버튼] | 누구나 |
| `/projects` | 목록: 검색, 필터, 정렬, 페이지 이동 | 누구나 |
| `/projects/[id]` | 상세 + 북마크 버튼 + 지원 버튼(지원 화면은 3번) | 누구나 (삭제된 건 없는 글로 처리) |
| `/projects/new` | 등록 | 로그인한 의뢰인 |
| `/projects/[id]/edit` | 수정 | 그 프로젝트의 의뢰인 본인 |
| `/me/projects` | 내가 올린 프로젝트 목록(상태별) + 마감·수정·삭제 | 의뢰인 본인 |
| `/me/bookmarks` | 내 북마크 목록 | 로그인한 사용자 본인 |

### 1-1. 목록 `/projects`
- 카드에 보이는 정보: 제목, 예산, 카테고리, 기술 태그, 모집 마감일, 모집 상태 배지 **[REA 후 확정]**
- 상태 배지: `scheduled` = "모집 예정", `recruiting` = "모집 중", 그 외 모두 = **"모집 마감"** [TEAM]
- 검색: 제목·설명에 키워드 포함 **[제안]**
- 필터: 카테고리, 기술 태그, 예산 범위, 모집 상태(모집 중만 보기) **[REA 후 확정]**
- 정렬: 최신순(기본), 마감 임박순, 예산 높은순 **[제안]**
- 한 번에 12개씩, 페이지 번호로 이동 **[제안]**
- 취소(`cancelled`) 프로젝트: 외부 목록에는 "모집 마감"으로 보이지 않게 **목록에서 제외** **[제안 — 확인 필요]**

### 1-2. 상세 `/projects/[id]`
- 구성: 제목·상태 배지 → 예산·모집 기간·카테고리·기술 태그 → 설명 → 의뢰인 정보(회사명·분야, 공개 프로필 `/users/[id]` 링크) → 버튼 영역 **[REA 후 확정]**
- 버튼: 프리랜서에게는 북마크 토글 + "지원하기"(`/projects/[id]/apply`, 3번). 의뢰인 본인에게는 "수정", "지원자 보기"(`/projects/[id]/applicants`, 3번), "모집 마감". 비로그인은 로그인 화면으로 보냄.
- "지원하기"는 상태가 `recruiting` 일 때만 보임 **[제안]**

### 1-3. 등록 `/projects/new`, 수정 `/projects/[id]/edit`
- 입력: 제목, 설명, 카테고리, 기술 태그(여러 개), 예산(원), 모집 시작일, 모집 마감일
- 프로필이 비어 있으면 `/me/profile?next=/projects/new` 로 보냄 [TEAM]
- 모집 시작일이 지금보다 미래면 `scheduled`, 아니면 `recruiting` 으로 저장 [TEAM: 등록 시 scheduled/recruiting]
- 수정은 `scheduled`, `recruiting` 상태에서만 허용 **[제안]**

## 2. 서버 동작 (Server Action)

모두 서버에서만 실행하고, 실행 전에 로그인·역할을 확인합니다.

| 이름(예정) | 하는 일 | 쓰는 DB |
| --- | --- | --- |
| `createProject(input)` | 입력 검사 후 등록. 시작일에 따라 상태 결정 | `projects` insert |
| `updateProject(id, input)` | 본인 프로젝트 수정(상태가 허용될 때만) | `projects` update |
| `closeProject(id)` | 수동 마감: `scheduled`/`recruiting` → `closed`. 처리 안 된 지원은 **3번의 함수를 호출**해 일괄 거절 + `project_closed` 알림 [TEAM] | `projects` update + 3번 함수 |
| `deleteProject(id)` | 소프트 삭제(`soft_delete_project` 함수 호출). `scheduled`/`recruiting`/`closed`/`cancelled` 에서만 가능 **[제안]** | `projects.deleted_at` |
| `toggleBookmark(projectId)` | 북마크 있으면 지우고 없으면 만듦 | `bookmarks` |
| `searchProjects(params)` | 목록 조회(검색·필터·정렬·페이지) | `projects` select |
| `getProject(id)` | 상세 1건 + 의뢰인 요약 | `projects`, `profiles` |
| `listMyProjects()` | 내 프로젝트 목록 | `projects` |
| `listMyBookmarks()` | 내 북마크의 프로젝트 목록 | `bookmarks` → `projects` |
| `getRecommendations()` | 추천 목록 (아래 4장) | `projects`, `profiles` |

- 시간 경과 자동 전환 [TEAM: 2번 담당]: 시작일이 되면 `scheduled` → `recruiting`, 마감일이 지나면 `recruiting` → `closed` (마감 시 미처리 지원 일괄 거절은 3번 함수). **실행 방식(주기 실행 vs 조회할 때 처리)은 아직 정하지 않았습니다.** 아래 6장 참고.

## 3. 입력 / 출력

### 등록·수정 입력

| 항목 | 규칙 |
| --- | --- |
| `title` | 필수, 2~100자 |
| `description` | 필수, 10~5000자 |
| `category` | 필수, 정해진 목록 중 하나 (목록은 아래 6장) |
| `skills` | 0~10개, 각 1~30자 |
| `budget` | 필수, 0 이상 정수(원) |
| `recruit_start_at` | 필수. 등록 시 과거 날짜는 "지금"으로 처리 |
| `recruit_end_at` | 필수, 시작일보다 뒤 (DB도 같은 규칙으로 막음) |

### 목록 조회 입력(주소의 `?` 값)
`q`(검색어), `category`, `skills`(여러 개), `budget_min`, `budget_max`, `recruiting_only`(true/false), `sort`(`latest` \| `deadline` \| `budget`), `page`

### 출력
- 목록: `{ items: [카드 정보...], total, page, pageSize }`
- 카드 정보: `id, title, budget, category, skills, recruit_end_at, display_status('scheduled'|'recruiting'|'closed')`
- 상세: `projects` 한 줄 + 의뢰인 `{ id, name, company_name, business_field }`
- 오류: 사람이 읽는 한국어 메시지 + 어느 입력 칸 문제인지

## 4. 추천 **[제안]**
- 로그인한 프리랜서: 내 프로필의 `category`, `skills` 와 겹치는 `recruiting` 프로젝트를, 겹치는 기술 수가 많은 순 → 마감 임박 순으로 최대 6개
- 프로필이 비었거나 비로그인: 최신 `recruiting` 프로젝트 6개
- 홈 화면(`/`)과 목록 위쪽에 표시

## 5. 권한 (DB 보안 규칙 RLS와 화면이 같은 규칙)

| 일 | 비로그인 | 프리랜서 | 의뢰인 본인 | 다른 의뢰인 |
| --- | --- | --- | --- | --- |
| 프로젝트 조회(삭제 제외) | O | O | O | O |
| 프로젝트 등록 | X | X | O | X |
| 프로젝트 수정·마감·삭제 | X | X | O | X |
| 북마크 조회·추가·삭제 | X | 본인 것만 | 본인 것만 | 본인 것만 |

- 근거 SQL: `supabase/migrations/0200_projects.sql`, `0201_bookmarks.sql`
- 삭제된 프로젝트는 아무에게도 조회되지 않습니다. `deleted_at` 은 `soft_delete_project` 함수로만 채울 수 있습니다.
- 다른 번호가 `projects.status` 를 바꾸는 일(수락 → `contract_pending`, 서명·결제 등)은 각자 Server Action/RPC에서 하며, 이 보안 규칙은 "의뢰인 본인만 수정"입니다. 의뢰인이 아닌 쪽(프리랜서·시스템)이 상태를 바꿔야 하면 해당 번호가 RPC(security definer)로 처리해야 합니다.

## 6. 정해야 할 것 (구현 전)
1. 시간 경과 자동 전환 실행 방식 — Supabase 주기 실행(pg_cron) / 조회할 때마다 처리. 마감 시 3번 함수 호출이 필요하므로 3번과 맞춰야 함.
2. 카테고리 목록(고정 값) — 1번 프로필의 `category` 와 같은 목록을 써야 하므로 1번과 맞춰야 함.
3. 취소된 프로젝트를 외부 목록에서 숨길지 (1-1 의 [제안]).
4. 위시켓 분석 결과를 본 뒤 필터·카드 항목 확정.

# 2번 기능 명세: 프로젝트 등록·탐색·북마크·추천·홈

- 담당: 2번 / 브랜치 `feat/2-projects` / DB 번호 `0200`~`0299`
- 근거: `docs/TEAM.md`, 위시켓 분석 `docs/rea/2-projects.md`, 3번 명세 `docs/specs/3-applications-notifications.md`
- 표시: **[TEAM]** TEAM.md 에 이미 정해진 것 / **[REA]** 위시켓 화면 흐름을 참고한 것 / **[제안]** 2번이 정한 것

## 1. 화면

| 주소 | 화면 | 누가 볼 수 있나 |
| --- | --- | --- |
| `/` | 홈: 검색창, 카테고리 버튼 5개, 최신 프로젝트 6개(모집 중만) [TEAM] | 누구나 |
| `/projects` | 목록: 키워드, 필터, 정렬, 10개씩 페이지 | 누구나 |
| `/projects/[id]` | 상세 + 북마크(프리랜서) + 지원하기(→ 3번 화면) + 추천 프로젝트 | 누구나 |
| `/projects/new` | 등록 3단계 | 로그인한 의뢰인 |
| `/projects/[id]/edit` | 수정 + 삭제 | 그 프로젝트의 의뢰인 본인 |
| `/me/projects` | 내 프로젝트(거래 단계 상태까지) + 마감·수정·삭제 | 의뢰인 본인 |
| `/me/bookmarks` | 내 북마크 | 프리랜서 본인 |

주소 값이 잘못되면(없는 id, 형식이 틀린 id) "찾을 수 없음" 화면이 나옵니다. 남의 프로젝트의 수정 주소도 같은 화면입니다.

### 1-1. 목록 `/projects`
- **키워드:** 제목과 설명에서 찾습니다. `%`, `_` 는 검색 기호가 아니라 글자로 다룹니다.
- **필터:** 카테고리 / 예산 범위(최소~최대) / 기술 스택(고른 것 중 하나라도 맞으면) / 모집 마감일 범위 / 모집 상태(모집 예정·모집 중·모집 마감). 적용된 필터 개수를 "필터" 옆에 보여 주고, "필터 초기화"가 있습니다.
- **정렬:** 최신순(기본) / 마감 임박순(모집 마감 건은 맨 뒤) / 예산 높은순.
- **페이지:** 10개씩, 번호로 이동. 총 개수 표시.
- **상태 글자:** `scheduled` = 모집 예정, `recruiting` = 모집 중, **그 외 모든 상태(`closed`, `contract_pending`, `in_progress`, `delivered`, `completed`, `cancelled`)는 "모집 마감"** [TEAM]. 취소된 프로젝트도 목록에서 숨기지 않고 "모집 마감"으로 보여 줍니다.
- **상태는 시간 기준으로 계산합니다.** DB 의 `status` 가 아직 `recruiting` 이어도 마감일이 지났으면 "모집 마감", `scheduled` 인데 시작일이 지났으면 "모집 중"으로 보입니다. (`project_display_status` 함수, 화면 코드 `displayStatus` 가 같은 규칙)
- 카드 정보: 상태 배지, 3일 이내 등록이면 NEW, 카테고리, 제목, 설명 2줄, 기술 태그, 예산, 모집 마감일 + "마감까지 N일", 지원자 수 **[REA]**. 예산이 0이면 "예산 협의".

### 1-2. 상세 `/projects/[id]`
- 구성: 머리(상태, 카테고리, 등록일, 제목) → 요약(예산, 지원자 수, 모집 시작·마감, 필요 기술) → 설명 → 의뢰인(이름·회사·업종, 공개 프로필 `/users/[id]` 링크) → 오른쪽 지원 영역 → 아래 추천 프로젝트 **[REA]**
- 위시켓은 로그인 전에 상세를 가리지만 WorkBridge 는 누구나 조회입니다 [TEAM].
- 지원 영역 버튼:
  | 보는 사람 | 버튼 |
  | --- | --- |
  | 비로그인 | "로그인하고 지원하기"(로그인 후 지원 화면으로), "북마크"(로그인으로) |
  | 프리랜서 | "지원하기"(`/projects/[id]/apply`, 3번) — 모집 중일 때만. 북마크 켜기/끄기 |
  | 등록한 의뢰인 | "지원자 보기"(`/projects/[id]/applicants`, 3번), "수정"(모집 예정·중), "모집 마감"(모집 중) |
  | 다른 의뢰인 | 버튼 없음 |
- **추천 프로젝트:** 같은 카테고리이거나 기술이 겹치는 **모집 중** 프로젝트 최대 4개. 점수 = (같은 카테고리 2점) + (겹치는 기술 개수). 점수가 높은 순, 같으면 최신순. 자기 자신은 제외.

### 1-3. 등록 `/projects/new` — 3단계
1. 제목(2~100자), 설명(10~5,000자), 카테고리
2. 모집 시작일, 모집 마감일, 예산(원) — **예산 칸 옆에 "AI 단가 분석" 버튼 자리**(`data-slot="ai-estimate-button"`, 지금은 눌리지 않는 버튼. **4번이 연결**)
3. 기술 스택(최대 10개, `src/lib/constants.ts` 의 `SKILLS` 에서 고름)

- 각 단계에서 "다음"을 누르면 그 단계 입력만 검사합니다. 이전/다음으로 오갈 수 있고, 3단계에서 "프로젝트 등록"으로 저장합니다.
- 로그인 안 함 → `/login?next=/projects/new`. 역할 미선택 → `/onboarding/role?next=...`. 프리랜서 → 안내 문구.
- **의뢰인 프로필이 비어 있으면(이름이 없으면) → `/me/profile?next=/projects/new`** [TEAM, 1번 명세의 "이름이 비어 있음" 기준]
- 시작일이 오늘 이후면 `scheduled`(모집 예정), 오늘이거나 지났으면 `recruiting`(모집 중) [TEAM]. 날짜는 한국 시간 기준이고, 마감일은 그날 밤 23:59:59 까지입니다.
- 마감일은 오늘 이후여야 합니다.

### 1-4. 수정 `/projects/[id]/edit`
- 본인 프로젝트만. 남의 것이면 "찾을 수 없음".
- 모집 예정·모집 중일 때만 수정할 수 있습니다. 모집이 끝났거나 계약이 진행 중이면 안내만 보입니다 **[제안]**.
- **지원자가 있으면 예산·모집 마감일은 잠깁니다.** 화면(읽기 전용 + 안내), 서버 동작(값이 다르면 거부), DB(`projects_guard_update`)에서 세 번 막습니다. 지원자가 있으면 모집 시작일을 앞으로 미루는 것도 막습니다 **[제안]**.
- 화면 아래에 "프로젝트 삭제"가 있습니다.

### 1-5. 내 프로젝트 `/me/projects`
- 카드마다 **거래 단계 상태**: 모집 예정 / 모집 중 / 모집 마감 / 계약 대기 / 작업 중 / 납품 요청 / 완료 / 취소 [TEAM]. (모집 단계는 시간 기준으로 계산)
- 버튼: 상세, 지원자 보기(3번), 수정(모집 예정·중), 모집 마감(모집 중), 삭제.

### 1-6. 내 북마크 `/me/bookmarks`
- 북마크한 프로젝트 목록(최근 북마크 순), "북마크 해제". 삭제된 프로젝트는 보이지 않습니다.

### 1-7. 미리보기 모드
`.env.local` 에 Supabase 주소·공개 키가 없으면 위 화면들이 **가짜 데이터**로 보이고(노란 안내 띠), 저장하려 하면 "저장되지 않습니다" 안내가 나옵니다. 키가 들어오면 자동으로 진짜 DB를 씁니다. 가짜 데이터는 `src/components/projects/sample.ts`.

## 2. 서버 동작 (Server Action) — `src/app/projects/actions.ts`

모두 서버에서만 실행하고, 실행할 때마다 로그인·역할·소유자를 다시 확인합니다. 실패하면 `{ error: "쉬운 한국어 문장" }` 을 돌려 화면에 보여 주고, 성공해서 이동할 때는 값을 돌려주지 않고 이동합니다.

| 이름 | 입력 | 하는 일 | 성공 후 |
| --- | --- | --- | --- |
| `createProject` | 폼(제목, 설명, 카테고리, 기술들, 예산, 시작일, 마감일) | 검사 후 `projects` insert. 시작일로 `scheduled`/`recruiting` 결정 | `/projects/[새 id]` 로 이동 |
| `updateProject(projectId)` | 같은 폼 | 본인·모집 중/예정·지원자 잠금 확인 후 update | `/projects/[id]` 로 이동 |
| `closeProject(projectId)` | 없음 | **3번의 `close_project_applications(p_project_id)` 하나만 호출.** `projects.status` 를 먼저 바꾸지 않음 | "모집을 마감했습니다. (거절된 지원 N건)" |
| `deleteProject(projectId)` | 없음 | DB 함수 `soft_delete_project` 로 `deleted_at` 만 채움 | `/me/projects` 로 이동 |
| `toggleBookmark(projectId, wanted)` | 켜기(true)/끄기(false) | `bookmarks` 추가(중복은 무시) 또는 삭제. 프리랜서만 | 화면 새로고침 |

화면에서 읽는 함수는 `src/components/projects/server.ts`: `searchProjects`, `getProject`, `getClientSummary`, `getRecommended`, `listMyProjects`, `listMyBookmarks`, `isBookmarked`, `getViewer`.

### 2-1. 3번과 맞춘 함수 (이름 확인 완료)
3번 명세·`0301_notifications.sql` 에 이미 정해져 있는 이름을 그대로 씁니다.

| 함수 | 부르는 곳 | 부르는 사람 |
| --- | --- | --- |
| `close_project_applications(p_project_id uuid)` → 이번에 거절된 지원 수(integer) | `closeProject`(수동 마감), `sync.ts`(자동 마감) | 수동: 로그인한 의뢰인 본인 / 자동: 서버 전용 서비스 키(`SUPABASE_SERVICE_ROLE_KEY`). 마감일이 지나지 않은 프로젝트는 3번 함수가 거부합니다(`NOT_DUE`) |

3번 함수가 지원 일괄 거절, 상태 `closed`, `project_closed` 알림까지 한 번에 처리합니다.

### 2-2. 시간 경과 자동 전환 — `src/components/projects/sync.ts` [TEAM: 2번 담당]
| 변화 | 방법 |
| --- | --- |
| 시작일이 됨: `scheduled` → `recruiting` | 서비스 키로 `projects` update (마감일 전인 것만) |
| 시작도 못 하고 마감일이 지남: `scheduled` → `closed` | 서비스 키로 update (지원자가 있을 수 없음) |
| 마감일이 지남: `recruiting` → `closed` | 3번 `close_project_applications` 호출 |

- **실행 시점:** 사람이 홈·목록·상세·내 프로젝트 화면을 열면, 응답이 끝난 뒤(`after`) 실행합니다. 30초에 한 번까지.
- **한계:** 아무도 접속하지 않으면 실행되지 않습니다. 그동안에도 화면 글자는 시간 기준으로 계산하므로 "모집 마감"으로 맞게 보이지만, 마감 알림은 다음 접속 때 나갑니다. 정시에 알림을 보내려면 정해진 시각마다 실행하는 장치(Vercel Cron 등)가 필요하고, 배포 설정은 1번 담당이라 요청이 필요합니다.
- `SUPABASE_SERVICE_ROLE_KEY` 가 없으면 자동 전환은 건너뜁니다. 수동 마감 버튼은 키 없이 동작합니다.

## 3. DB (`supabase/migrations`)

| 파일 | 내용 |
| --- | --- |
| `0200_projects.sql` | `projects` 테이블, RLS(누구나 조회·삭제 제외 / 의뢰인 본인만 등록·수정), 삭제 함수 |
| `0201_bookmarks.sql` | `bookmarks` 테이블, RLS(본인만) |
| `0202_project_search.sql` | `project_display_status`, `search_projects`(검색·필터·정렬·페이지), `project_applicant_counts`(지원자 수만 공개), `project_has_applicants`, `projects_guard_update`(지원자 있으면 예산·마감일 잠금), `soft_delete_project`(지원자 있는 모집 중이면 삭제 거부) |
| `0203_project_status_guard.sql` | `projects_guard_status`: 의뢰인이 직접 보내는 요청으로는 `scheduled` ↔ `recruiting` 외의 상태 변경을 막음 |

실행 순서: 1번의 `0100` → `0200` → `0201` → `0202` → `0203` → (3번) `0300` → `0301`. `0202`, `0203` 은 `0300` 보다 먼저 실행해도 됩니다.

## 4. 입력·출력 규칙

| 항목 | 규칙 |
| --- | --- |
| 제목 | 2~100자 |
| 설명 | 10~5,000자 |
| 카테고리 | `CATEGORIES` 중 하나 (`src/lib/constants.ts`, 1번과 같은 목록) |
| 기술 | `SKILLS` 에서 0~10개 |
| 예산 | 0 이상 정수(원), 최대 999,999,999,999. 0이면 "예산 협의" |
| 모집 시작·마감일 | 날짜(한국 시간). 마감일 ≥ 시작일 |

목록 주소의 값: `q`, `category`, `skills`(여러 개), `budget_min`, `budget_max`, `deadline_from`, `deadline_to`, `status`(`scheduled|recruiting|closed`), `sort`(`latest|deadline|budget`), `page`. 잘못된 값은 버리고 기본값을 씁니다.

## 5. 권한 (DB 보안 규칙 RLS + 서버 동작 + 화면이 같은 규칙)

| 일 | 비로그인 | 프리랜서 | 의뢰인 본인 | 다른 의뢰인 |
| --- | --- | --- | --- | --- |
| 프로젝트 조회(삭제 제외) | O | O | O | O |
| 지원자 수 조회 | O(숫자만) | O | O | O |
| 프로젝트 등록 | X | X | O | X |
| 수정·마감·삭제 | X | X | O | X |
| 북마크 조회·추가·삭제 | X | 본인 것만 | — | — |

- 삭제된 프로젝트는 아무에게도 조회되지 않습니다. `deleted_at` 은 `soft_delete_project` 로만 채웁니다.
- **`projects.status` 는 직접 바꿀 수 없습니다(0203).** 의뢰인이 직접 보내는 요청으로는 `scheduled` ↔ `recruiting` 만 가능합니다. 나머지(수락 → `contract_pending`, 모집 마감, 합의 결렬, 서명, 결제, 납품, 완료)는 각 담당의 **`security definer` DB 함수**로만 바뀝니다. 4번 함수도 반드시 그렇게 만들어야 합니다. 서버 전용 서비스 키와 SQL Editor 는 막지 않습니다.

## 6. 다른 번호에 요청할 것
- **1번:** 정해진 시각에 `sync` 를 실행하는 장치(Vercel Cron 등)가 필요하면 배포 설정(`vercel.json`)과 비밀 값(`CRON_SECRET`)을 요청. 지금은 접속할 때 실행하는 방식만 있습니다.
- **4번:** "AI 단가 분석" 버튼을 `src/components/projects/project-form.tsx` 의 `data-slot="ai-estimate-button"` 자리에 연결해야 합니다. 이 파일은 2번 폴더라서, 4번이 연결 코드를 알려 주면 2번이 끼웁니다.
- **3번:** 상세·목록의 지원자 수는 `project_applicant_counts`(2번 함수)로 읽습니다. 지원 테이블 이름·`deleted_at` 이 바뀌면 알려 주세요.

## 7. 아직 하지 않은 것
- 실제 Supabase 에 `0200`~`0202` 를 실행하고 두 계정(의뢰인·프리랜서)으로 직접 확인하는 일 (SQL 은 임시 DB 에서만 시험함)
- 위시켓 카드의 "조회 수준", "관심 담은 파트너 수", "지원 적은 순" 정렬 (조회수 테이블이 없고 북마크 수는 공개 집계가 필요해 제외)

# WorkBridge 팀 운영 규칙 (5인 병렬 작업)

> 에이전트는 작업을 시작하기 전에 이 파일을 반드시 읽고 따른다.

## 1. 담당 영역과 브랜치

| 번호 | 담당 | 브랜치 | 내가 만드는 폴더/파일 | DB 마이그레이션 번호 |
| --- | --- | --- | --- | --- |
| 1 | 기반·인증·프로필·배포·합치기 | `feat/1-auth-profile` | `src/app/(auth)/**`, `src/app/auth/**`, `src/app/onboarding/**`, `src/app/me/profile/**`, `src/app/users/**`, `src/components/layout/**`, `src/lib/supabase/**`, `src/proxy.ts` | `0100`~`0199` |
| 2 | 프로젝트 등록·탐색·북마크·추천·홈 | `feat/2-projects` | `src/app/page.tsx`, `src/app/projects/**`(아래 `[id]/apply`, `[id]/applicants` 제외), `src/app/me/projects/**`, `src/app/me/bookmarks/**`, `src/components/projects/**` | `0200`~`0299` |
| 3 | 지원·수락/거절·알림 | `feat/3-applications-notifications` | `src/app/projects/[id]/apply/**`, `src/app/projects/[id]/applicants/**`, `src/app/me/applications/**`, `src/app/notifications/**`, `src/components/applications/**`, `src/components/notifications/**`, `src/lib/notifications.ts` | `0300`~`0399` |
| 4 | AI 단가 분석·금액 합의·계약서·서명 | `feat/4-ai-contract` | `src/app/ai-estimate/**`, `src/app/contracts/**`, `src/app/api/ai/**`, `src/components/ai/**`, `src/components/contracts/**` | `0400`~`0499` |
| 5 | 결제·에스크로 정산·리뷰 | `feat/5-payment-review` | `src/app/payments/**`, `src/app/api/payments/**`, `src/app/reviews/**`, `src/components/payments/**`, `src/components/reviews/**` | `0500`~`0599` |

- **남의 폴더는 고치지 않는다.** 꼭 필요하면 단톡방에 요청하고, 그 사람이 고친다.
- 헤더 메뉴(`src/components/layout`)는 1번이 관리한다. 메뉴를 추가하고 싶으면 1번에게 요청한다.
- `src/components/ui/**`(shadcn 컴포넌트)는 누구나 `npx shadcn@latest add <이름>`으로 **추가만** 할 수 있다. 기존 파일 수정은 금지.
- `package.json`에 라이브러리를 추가하면 PR 설명에 적는다.

## 2. 데이터베이스 약속 (모두 이 이름을 그대로 쓴다)

- 테이블과 SQL은 `supabase/migrations/` 에 `번호_설명.sql` 로 만든다. 예: `0200_projects.sql`, `0201_bookmarks.sql`
- Supabase는 **1번이 만든 팀 공용 프로젝트 하나**를 쓴다. SQL은 Supabase 대시보드 SQL Editor에서 번호 순서대로 실행한다.
- 모든 테이블에 RLS를 켜고, 정책도 같은 SQL 파일에 쓴다.
- 삭제는 `deleted_at` 컬럼으로 하는 소프트 삭제만 쓴다.

| 테이블 | 담당 | 핵심 컬럼(최소) |
| --- | --- | --- |
| `profiles` | 1 | `id`(= auth.users.id), `role`('client' \| 'freelancer'), `name`, `email`, `avatar_url`, `bio`, 의뢰인: `company_name`, `business_field`, `website` / 프리랜서: `category`, `skills`(text[]), `career_years`, `hourly_rate`, `portfolio_url` |
| `projects` | 2 | `id`, `client_id`→profiles, `title`, `description`, `category`, `skills`(text[]), `budget`, `recruit_start_at`, `recruit_end_at`, `status`, `deleted_at`, `created_at` |
| `bookmarks` | 2 | `user_id`, `project_id` (둘 합쳐서 중복 불가) |
| `applications` | 3 | `id`, `project_id`, `freelancer_id`, `cover_letter`, `proposed_amount`, `proposed_days`, `status`, `reject_reason`, `created_at` (project_id+freelancer_id 중복 불가) |
| `notifications` | 3 | `id`, `user_id`, `type`, `title`, `body`, `link`, `read_at`, `created_at` |
| `ai_estimates` | 4 | `id`, `project_id`, `client_id`, `items`(jsonb), `total_amount`, `created_at` |
| `contracts` | 4 | `id`, `project_id`, `application_id`, `client_id`, `freelancer_id`, `agreed_amount`, `status`, `client_signed_at`, `freelancer_signed_at`, `start_date`, `end_date` |
| `payments` | 5 | `id`, `contract_id`, `order_id`, `payment_key`, `amount`, `fee_amount`(10%), `payout_amount`, `status`, `approved_at`, `paid_out_at` |
| `reviews` | 5 | `id`, `contract_id`, `reviewer_id`, `reviewee_id`, `rating`(1~5), `content`, `tags`(text[]) (contract_id+reviewer_id 중복 불가) |

### 상태값 (영어 값은 DB, 한글은 화면 표시)

- `projects.status`: `scheduled`(모집 예정) → `recruiting`(모집 중) → `closed`(모집 마감) / `contract_pending`(계약 대기) → `in_progress`(작업 중) → `delivered`(납품 요청) → `completed`(완료) / `cancelled`(취소)
  - 외부 목록(`/projects`)에서는 `scheduled`, `recruiting` 외에는 모두 **"모집 마감"** 으로 보여준다.
  - 금액 합의가 결렬되면 `contract_pending` → `recruiting` 으로 돌아간다. (이미 자동 거절된 지원자는 복구하지 않음)
  - 취소는 `scheduled`, `recruiting`, `closed`, `contract_pending` 에서만 가능.
- `applications.status`: `pending`(검토중), `accepted`(수락), `rejected`(거절)
  - `reject_reason`: `manual`(직접 거절), `auto`(다른 지원자 수락), `closed`(모집 마감), `negotiation_failed`(금액 합의 결렬)
- `contracts.status`: `negotiating`(금액 합의 중), `signing`(서명 중), `signed`(체결), `cancelled`
- `payments.status`: `ready`, `paid`(에스크로 보관), `paid_out`(정산 완료), `failed`, `refunded`

### 누가 어떤 상태로 바꾸나

| 바꾸는 일 | 담당 |
| --- | --- |
| 등록 시 `scheduled`/`recruiting`, 시간 경과 자동 전환, 수동 마감 버튼 | 2 (마감할 때 미처리 지원 일괄 거절 + 알림은 3번의 함수를 호출) |
| 지원자 수락 → `contract_pending` + 다른 지원 자동 거절 + 알림 | 3 |
| 금액 합의 결렬 → `recruiting` 복귀, 서명 완료 | 4 |
| 결제 완료 → `in_progress`, 납품 요청 → `delivered`, 완료 승인 → `completed` | 5 |

## 3. 알림 약속

- 알림은 3번이 만드는 `src/lib/notifications.ts` 의 `createNotification({ userId, type, title, body, link })` 하나로만 만든다. 서버에서만 호출한다.
- `type` 값: `application_submitted`, `application_accepted`, `application_auto_rejected`, `application_rejected`, `project_closed` (필수 5종) / `amount_proposed`, `amount_agreed`, `amount_declined`, `contract_signed`, `payment_completed`, `delivery_requested`, `delivery_approved`, `review_requested` (선택)

## 4. 화면 주소 약속

| 주소 | 화면 | 담당 |
| --- | --- | --- |
| `/` | 홈(검색창, 카테고리 버튼) | 2 |
| `/login`, `/signup`, `/auth/callback`, `/onboarding/role` | 로그인·가입·역할 선택 | 1 |
| `/me/profile`, `/users/[id]` | 내 프로필, 공개 프로필(평균 별점·리뷰 목록 자리는 5번 컴포넌트를 끼움) | 1 |
| `/projects`, `/projects/[id]`, `/projects/new`, `/projects/[id]/edit` | 목록·상세·등록·수정 | 2 |
| `/me/projects`, `/me/bookmarks` | 내 프로젝트(의뢰인), 내 북마크(프리랜서) | 2 |
| `/projects/[id]/apply`, `/projects/[id]/applicants`, `/me/applications` | 지원, 지원자 관리, 내 지원 현황 | 3 |
| `/notifications` | 알림 목록 | 3 |
| `/ai-estimate/[projectId]` | AI 단가 분석 결과 | 4 |
| `/contracts`, `/contracts/[id]` | 계약 목록·상세(서명) | 4 |
| `/payments/[contractId]`, `/payments/success`, `/payments/fail`, `/payments/history` | 결제·결과·내역 | 5 |
| `/reviews/new/[contractId]` | 리뷰 작성 | 5 |

- 프로필 완성 유도: 1번이 `/me/profile?next=<돌아갈 주소>` 를 만든다. 2번(등록), 3번(지원)은 프로필이 비어 있으면 이 주소로 보낸다.

## 5. Git 규칙

- `main` 에 직접 올리지 않는다. 내 브랜치에서만 작업한다.
- 커밋 메시지: `feat: 프로젝트 목록 필터 추가`, `fix: ...`, `docs: ...`
- 매일 아침: `main` 최신 내용을 내 브랜치로 가져온다.
- 매일 저녁 6시: 내 브랜치 → `main` PR을 연다. 1번이 확인하고 합친다.
- PR 설명에는 ①만든 것 ②확인한 방법 ③RFP에 없어서 팀이 정한 것과 이유 를 쓴다.
- `.env.local`, 키 값은 절대 커밋하지 않는다. 키는 단톡방 개인 메시지로만 주고받는다.

## 6. 기록

- 위시켓 REA 분석: `docs/rea/<번호>-<주제>.md`
- 기능 명세(서버 인터페이스 포함): `docs/specs/<번호>-<주제>.md`
- 결정 기록: `docs/decisions/YYYY-MM-DD-<주제>.md`
- 스프린트 계획·회고: `docs/sprints/`

# 3번 기능 명세 — 지원·선정·알림

작성일: 2026-11-23. 갱신: 2026-11-24. 기준: `CLAUDE.md`, `AGENTS.md`, `docs/TEAM.md` 및 사용자 요구.
브랜치: `feat/3-applications-notifications`. 담당 밖의 파일은 변경하지 않는다.

## 현재 준비 상태

- 지원, 지원자 관리, 내 지원 현황, 알림 페이지와 헤더용 알림 종 구현.
- `0300`~`0303` SQL 작성. 실 DB에 적용하지 않았다.
- 최신 `main`의 실제 profiles/projects SQL과 인증·프로필 화면을 반영했다. 프로필 저장 후 지원 복귀도 로컬에서 확인했다. 프로젝트·계약 화면 연결은 아직 남아 있다.
- Supabase 환경 변수·팀 공용 DB가 준비되기 전에는 연결 대기 안내를 보여준다.
- 임시 계정 3개로 지원 → 수락 → 자동 거절 → 알림과, WebSocket 대역을 통해 종/목록의 새로고침 없는 갱신을 확인했다. 실제 Supabase 계정 3개 검증, 공통 헤더/계약 연결 및 실제 Supabase Realtime 수신 확인은 미완료이다.

## 화면·입력·출력

| 화면 | 입력과 동작 | 성공 출력 | 권한·실패 |
| --- | --- | --- | --- |
| `/projects/[id]/apply` | 자기소개 `cover_letter` 1~5,000자, 금액 `proposed_amount` 1~999,999,999,999원 정수, 기간 `proposed_days` 1~3,650일 정수 | `submit_application` 성공 후 `/me/applications` 이동 | 로그인한 프리랜서만. 미완성 프로필은 `/me/profile?next=%2Fprojects%2F[id]%2Fapply`. 중복·모집 전/마감·삭제 프로젝트 거부 |
| `/projects/[id]/applicants` | 지원 목록과 펼쳐 보는 지원서. 수락 시 계약 협의 시작 금액과 자동 거절 확인 체크. 직접 거절 버튼 | 처리 후 목록 갱신. 수락 금액 보존 | 프로젝트 의뢰인 본인만. 다른 의뢰인·프리랜서는 404. 서버와 RPC에서도 재검사 |
| `/me/applications` | 본인 지원 목록 조회, 지원서 펼치기 | 검토중/수락/거절과 원인, 제안 금액·기간, 협의 시작 금액 표시 | 본인 프리랜서만. 다른 지원자의 행은 RLS에서 숨김 |
| `/notifications` | 알림 선택, 모두 읽음, 이전/다음 | 선택한 본인 알림 읽음 처리 후 DB에 저장된 내부 주소로 이동 | 수신자 본인만. 30개씩 최신순. 모두 읽음은 모든 페이지의 본인 미확인 알림에 적용 |
| `NotificationBell` | 최초 미확인 개수 조회, Realtime 이벤트 시 재조회, 포커스 복귀·30초 주기 보완 조회 | 미확인 숫자, 99 초과는 `99+`, 조회 실패는 `!` | 비로그인·키 미설정이면 표시 안 함. 1번이 헤더에 삽입 |

조회 오류는 재시도 화면, 처리 오류는 폼 안내로 표시한다. DB 오류 원문과 키는 화면으로 보내지 않는다.
내 지원 현황과 지원자 관리는 30개씩 페이지를 나누고 전체 건수를 표시한다. 지원자 이름은 공개 프로필의 name 컬럼만 읽는다. 지원서 제출 검증 실패 시 작성 내용을 유지한다.
프로필 완성 기준은 1번의 최신 프로필 화면에 맞춰 **name이 비어 있지 않은 상태**로 통일했다. bio/category/skills는 선택 입력이다. 활동 중인 freelancer 역할인지는 별도로 서버와 RPC에서 검사한다. 0303이 초기의 더 강한 조건을 교체한다.

## 데이터

`0300`은 `public.applications`, `0301`은 `public.notifications`와 업무 RPC를 생성한다.
`0302`는 기존 테이블을 다시 만들지 않고 회원 상태 검사, RLS와 업무 함수만 보완한다. 이미 적용한 0300/0301을 다시 만들지 않고 접근 제어만 보완한다.
`0303`은 지원 시 프로필 필수 조건을 이름으로 통일한다. 이미 적용한 SQL은 재실행하지 않고, 미적용 번호만 순서대로 실행한다.
실행 전 1번의 profiles와 2번의 projects가 UUID 기본키 및 TEAM.md의 필수 컬럼으로 존재해야 한다.
함수는 `projects.client_id`, `status`, `deleted_at`, `recruit_start_at`, `recruit_end_at`을 사용한다. 모집 시각은 시간대가 포함된 값으로 합의해야 한다.

- applications: TEAM.md 필수 컬럼 전체. `project_id + freelancer_id` 영구 중복 금지. `accepted_agreed_amount`, `accepted_at`, `updated_at`, `deleted_at` 추가.
- 알림: TEAM.md 필수 컬럼 전체. `event_key`, `deleted_at` 추가. `(user_id, event_key)`로 동일 사건 재실행의 중복 알림 방지. event_key 생략 시 매번 새 알림.
- soft delete만 사용. UI에서 지원·알림 삭제 기능은 제공하지 않는다. 거절된 지원은 지우지 않는다.
- 동일 프로젝트에서 삭제되지 않은 accepted 지원은 최대 1개. rejected 상태에는 reject_reason이 반드시 있고, 다른 상태에는 없다.
- 금액·기간·자기소개 범위는 서버와 SQL 양쪽에서 검사한다.

상태값은 팀 규칙 그대로 사용한다.

| 상태 | 화면 표시 |
| --- | --- |
| pending | 검토중 |
| accepted | 수락 |
| rejected + manual | 거절 / 의뢰인 직접 거절 |
| rejected + auto | 거절 / 다른 지원자 선정 |
| rejected + closed | 거절 / 모집 마감 |
| rejected + negotiation_failed | 거절 / 금액 합의 결렬 |

`negotiation_failed`로 바꾸고 모집을 다시 여는 동작은 4번 담당이다. 3번은 값 표시를 지원한다. 자동 거절되었던 지원은 다시 살리지 않고 중복 지원도 허용하지 않는다.

## 서버 인터페이스와 부수 효과

모든 UUID는 DB가 검증하고 액션에서도 형식을 검사한다. 사용자의 ID는 폼에서 받지 않고 인증 세션에서 얻는다.
아래 RPC는 각각 하나의 DB 트랜잭션이다. 알림 삽입까지 하나라도 실패하면 전체가 취소된다.

### 지원 `submit_application`

```ts
supabase.rpc('submit_application', {
  p_project_id: projectId,
  p_cover_letter: coverLetter,
  p_proposed_amount: amount,
  p_proposed_days: days,
}) // data: application UUID
```

인증한 프리랜서 → 프로젝트 잠금 → 프로필/모집 시간/중복 확인 → pending 지원 저장 → 의뢰인 `application_submitted` 알림.
모집 시작·종료 시각이 없는 경우도 지원을 허용하지 않는다. 프로젝트 상태와 시간 검사 모두 통과해야 한다.
자신의 프로젝트 지원 금지. 제출 후 이동은 Server Action에서 처리한다.

### 수락 `accept_application`

```ts
supabase.rpc('accept_application', {
  p_application_id: applicationId,
  p_agreed_amount: amount,
}) // data: accepted application UUID
```

본인 프로젝트의 의뢰인 → 프로젝트 잠금 → pending 대상 확인 → accepted와 협의 시작 금액 저장 → 같은 프로젝트의 다른 pending을 rejected/auto로 변경 → 프로젝트 contract_pending → 선정자/의뢰인에게 application_accepted, 다른 대기자에게 application_auto_rejected.
동일 지원/금액의 재실행은 동일 ID를 반환하고 중복 알림을 만들지 않는다. 이미 처리된 다른 대상·금액은 거부한다.
마감 시각이 지났어도 2번의 마감 RPC 처리 전이고 프로젝트가 recruiting이면 기존 대기 지원자를 선정할 수 있다. 마감 RPC와 수락이 겹치면 프로젝트 잠금을 먼저 얻고 성공한 작업을 따른다.
계약 테이블은 수정하지 않는다. 협의 시작 금액은 최종 쌍방 합의나 법적 계약 체결을 의미하지 않는다.

### 직접 거절 `reject_application`

```ts
supabase.rpc('reject_application', { p_application_id: applicationId })
// data: application UUID
```

의뢰인 본인 + recruiting 프로젝트 + pending 지원만 가능. rejected/manual 변경과 application_rejected 알림을 함께 저장한다. 같은 직접 거절 재실행은 중복 알림 없이 성공한다.

### 모집 마감 `close_project_applications` — 2번 연결점

```ts
supabase.rpc('close_project_applications', { p_project_id: projectId })
// data: 이번에 pending → rejected로 바뀐 행 수 (integer)
```

**2번은 projects.status를 먼저 closed로 바꾸지 말고 이 RPC 하나를 호출해야 한다.**

- 인증된 프로젝트 의뢰인 본인: recruiting 프로젝트를 수동 마감.
- 서버 전용 service_role: recruit_end_at이 지난 recruiting 프로젝트만 자동 마감. 이른 마감 금지.
- pending → rejected/closed, 프로젝트 → closed, 지원자 전원 → project_closed 알림을 한 번에 처리.
- 이미 manual 등으로 거절된 지원의 이유는 유지하면서 마감 소식도 전달한다.
- 이미 closed이면 0 반환. 재호출 알림 없음. contract_pending 등 다른 상태는 거부.
- scheduled → recruiting 전환, 마감 스케줄러 구축·호출 및 취소 흐름은 2번 담당.

### 공용 알림 `createNotification` — 4·5번 연결점

```ts
import { createNotification } from '@/lib/notifications';
await createNotification({
  userId: recipientId,
  type: 'amount_proposed',
  title: '새 금액 제안이 도착했습니다',
  body: '계약 내용을 확인해 주세요.',
  link: `/contracts/${contractId}`,
  eventKey: `amount-proposed:${proposalId}`, // 선택, 재시도할 때 같은 값
}); // Promise<string>: notification UUID
```

서버 모듈에만 import한다. **Server Action으로 직접 노출한 범용 알림 발송 API가 아니다.** 호출자가 먼저 사용자와 업무 권한을 검증해야 한다.
SUPABASE_SERVICE_ROLE_KEY는 서버 안에서만 사용하며 브라우저로 보내지 않는다. 생성 RPC의 실행 권한도 service_role만 가진다.
읽음은 사용자의 세션 클라이언트로 수행하고 관리자 키를 사용하지 않는다.

**중요:** 계약·결제 변경과 알림을 묶을 때 JS의 DB 호출 두 번은 원자적이지 않다. 4·5번의 업무 RPC **내부에서** 아래 공통 저장 함수를 호출한다.

```sql
perform public.create_notification(
  recipient_id, 'amount_proposed', '새 금액 제안이 도착했습니다',
  '계약 내용을 확인해 주세요.', '/contracts/' || contract_id,
  'amount-proposed:' || proposal_id
);
```

JS `createNotification`도 같은 SQL 함수를 사용한다. 3번의 지원 관련 RPC 역시 이 함수를 트랜잭션 안에서 호출한다. 알림을 RPC 밖에서 중복 발송하지 않는다.

## 알림 사건과 이동

| type | 받는 사람 | 이동 |
| --- | --- | --- |
| application_submitted | 의뢰인 | `/projects/[id]/applicants` |
| application_accepted | 선정 프리랜서 | `/me/applications` |
| application_accepted | 의뢰인 (수락 확인) | `/projects/[id]/applicants` |
| application_auto_rejected | 다른 대기 프리랜서 | `/me/applications` |
| application_rejected | 직접 거절된 프리랜서 | `/me/applications` |
| project_closed | 해당 프로젝트 지원자 전원 | `/me/applications` |

계약 ID는 4번이 생성하기 때문에 수락 알림은 항상 존재하는 내 지원 현황으로 연결한다.
선택 알림 type 8종도 TEAM.md 그대로 허용한다. SMS·이메일·카카오 발송은 구현 범위 밖이다.

## 권한과 보안

- applications SELECT: 지원한 본인 또는 그 프로젝트의 의뢰인만. 프로젝트가 비공개 상태로 전환되어도 소유자 검사 함수가 지원서 조회를 유지한다.
- applications 클라이언트 직접 INSERT/UPDATE/DELETE 금지. 인증·업무 권한을 검사하는 RPC만 사용.
- notifications SELECT: 수신자 본인만. UPDATE 권한은 read_at 컬럼에만 부여. 수신자·제목·본문 변경이나 임의 삽입 금지.
- `application_member_is_active()`는 인증한 본인의 탈퇴 여부만 반환한다. 0100이 deleted_at 컬럼 조회를 공개하지 않으므로 별도 안전한 함수를 사용한다. 탈퇴 계정은 지원서/알림 조회·읽음 변경 및 업무 RPC가 차단된다.
- 0100의 role은 가입 직후 null일 수 있다. null은 프리랜서로 취급하지 않으며 화면은 역할 선택으로 보낸다. 수락 대상도 활동 중인 프리랜서여야 한다.
- SECURITY DEFINER 함수는 search_path를 빈 값으로 고정하고 객체 이름을 명시한다. PUBLIC/anon의 RPC 실행 권한 회수.
- 폼의 지원서 ID·프로젝트 ID는 액션과 DB에서 다시 확인한다. 알림 이동 주소는 제출 폼이 아닌 DB 값 사용. 외부 URL·이중 슬래시·백슬래시·제어문자 금지.
- 일반 클라이언트는 Supabase 공개 URL·anon 키와 RLS를 사용한다. 서비스 역할 키·다른 서비스의 비밀 키는 NEXT_PUBLIC_ 금지.
- 헤더에서 미확인 숫자 표시가 실패하면 0이라고 오해시키지 않고 `!` 표시.
- 읽음/모두 읽음은 루트 layout도 재검증한다. 헤더용 종은 수신자와 서버 조회 개수를 key로 사용해 변경된 숫자를 즉시 반영한다. 실제 1번 헤더에 삽입한 상태의 통합 검사는 남아 있다.

## 통합 담당자에게 전달할 요청

다음은 전달용 문구이며 실제 메시지를 보내지는 않았다.

1. **1번님:** 최신 Header는 Client Component이므로 `import { NotificationBellWidget } from '@/components/notifications/notification-bell-widget'` 후 기존 `data-slot="header-notifications"` 자리에 `<NotificationBellWidget />`을 넣어 주세요. server-only 모듈을 사용하는 `notification-bell.tsx`는 현재 클라이언트 헤더에 직접 import하면 안 됩니다. 이름만 필수인 프로필 조건과 next 복귀는 3번에서 맞춰 로컬 검증했습니다. 공통 Header의 기존 ESLint 오류(16행 set-state-in-effect)도 수정이 필요합니다.
2. **2번님:** projects의 UUID/필드·모집 시간대를 확인해 주세요. 상세의 지원 버튼은 `/projects/${id}/apply`, 본인 지원자 관리는 `/projects/${id}/applicants`입니다. 수동/자동 마감은 `close_project_applications` RPC로만 처리해 주세요. 수락·거절 이후에도 의뢰인은 자신의 프로젝트를, 지원자는 자신의 지원 대상 프로젝트의 제목·상세를 읽을 수 있는 정책을 검토해 주세요.
3. **4번님:** 수락 결과 applications의 accepted_agreed_amount/accepted_at을 읽어 계약 협의를 시작해 주세요. 계약 생성의 중복은 application_id로 막아 주세요. 합의 결렬 시 프로젝트 복귀와 선정 지원 rejected/negotiation_failed 변경·알림을 하나의 RPC에서 처리하고 프로젝트 행을 먼저 잠가 주세요. 이미 auto 거절된 지원은 복원하지 않습니다. 계약 생성 시점/연결 동작은 통합 시 확인이 필요합니다.
4. **4·5번님:** 단독 서버 알림은 createNotification, 여러 테이블 변경에 붙는 알림은 업무 RPC 내부 create_notification을 사용해 주세요.

## 실행·검증 순서

1. 1번·2번의 `0100`~`0299` 마이그레이션을 먼저 합친다. 실제 컬럼·타입을 대조한다.
2. 팀 공용 DB에서 아직 적용하지 않은 SQL만 `0300` → `0301` → `0302` → `0303` 순서로 실행한다. 이 작업에서는 실 DB에 실행하지 않았다.
3. 1번에게 받은 공개 URL·anon 키 및 서버 전용 키를 `.env.local`에 입력한다. 현재 파일을 만들거나 키를 받지 않았다.
4. `npm run lint`, `npm run build`로 검사한다.
5. `src/components/applications/tests/database.mjs`로 임시 DB 검증을 재현한다. PGlite는 저장소 dependency에 추가하지 않고 외부 테스트 폴더에 설치할 수 있다. `WORKBRIDGE_PGLITE_MODULE`에 그 모듈의 `dist/index.js` 절대 경로를 지정해 실행한다.
6. `docs/sprints/2026-11-24-3-validation.md`의 로컬 재현 방법과 남은 실제 계정 시나리오를 실행한다.

Realtime: 0301은 Supabase의 `supabase_realtime` publication이 있으면 notifications만 추가한다. 브라우저에서 수신자 필터를 적용하며 RLS도 작동한다. 알림 목록과 종은 각각 구독하므로 헤더를 연결하기 전에도 목록은 갱신된다. 이벤트를 200ms 동안 묶고 동시에 하나의 개수 조회만 실행한다. 채널 오류 시 30초 보완 조회, 포커스·온라인 복귀·탭 재표시 때 재조회하며 로그아웃/계정 전환/화면 이탈 때 구독과 타이머를 정리한다. 실제 Supabase 검증은 아직 하지 않았다.

목~금 범위 검증·실서비스 재현 방법·회고: `docs/sprints/2026-11-24-3-final.md`.

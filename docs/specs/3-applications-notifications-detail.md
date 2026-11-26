# WorkBridge 세부명세서 — 3번 지원·선정·알림

| 항목 | 내용 |
| --- | --- |
| 버전 / 기준일 | 1.0 / 2026-11-25, 한국 시간 |
| 범위 | 3번 화면·Server Action·DB 함수·권한·알림·팀 연결·검증 |
| 코드 기준 | 지원·알림 `5323b19`, 최신 main `028186c` 반영 |
| 상위 문서 | [기능명세서](./3-applications-notifications.md) |
| 준수 문서 | `CLAUDE.md`, `AGENTS.md`, `docs/TEAM.md` |

## 1. 구현 구성

경로는 저장소 루트 기준이다. RPC는 여러 변경을 한 번의 DB 트랜잭션으로 처리하는 Postgres 함수다.

| 기능 ID | 소스 | 책임 |
| --- | --- | --- |
| APP-01~03 | `src/app/projects/[id]/apply/{page.tsx,actions.ts}` | 지원 진입·검증·RPC·이동 |
| APP-04~06 | `src/app/projects/[id]/applicants/{page.tsx,actions.ts}` | 소유자 확인·목록·결정 |
| APP-08 | `src/app/me/applications/page.tsx` | 본인 지원·결과·거절 이유 |
| NTF-02~04 | `src/app/notifications/{page.tsx,actions.ts}` | 목록·읽음·모두 읽음·이동 |
| 공통 | `src/components/applications/{model.ts,server.ts,pagination.ts}` | 상태·오류·회원 검사·페이지 계산 |
| 입력 폼 | `src/components/applications/{apply-form.tsx,decision-form.tsx}` | 입력·전송 상태·오류 안내 |
| NTF-05~06 | `src/components/notifications/**` | 종·구독·목록 갱신·모두 읽음 버튼 |
| NTF-07 | `src/lib/notifications.ts` | 서버 전용 알림 생성 |
| APP-02~07, NTF-01 | `supabase/migrations/0300`~`0303` | 테이블·제약·RLS·업무 함수 |

## 2. 공통 진입·조회 규칙

1. 공개 URL·anon 키가 없으면 연결 준비 안내를 표시한다. SQL 미적용·조회 실패는 오류 경계에서 재시도를 안내한다.
2. `requireMember(next)`는 `auth.getUser()`와 `application_member_is_active()`로 인증·활동 상태를 검사한다. 미로그인·탈퇴 계정은 `/login?next=<인코딩한 주소>`로 보낸다.
3. 회원 상태 확인이 실패하면 오류 처리한다. 프로필이 없으면 프로필 입력, 역할이 없으면 역할 선택으로 보낸다.
4. URL의 프로젝트 ID와 액션의 지원 ID는 UUID 형식을 검사한다. 사용자 ID는 폼에서 받지 않고 세션에서 얻는다.
5. 화면 접근 검사 외에 Server Action과 DB 함수에서도 업무 권한을 재검사한다.

| 목록 | 정렬 | 페이지 / 조회 범위 |
| --- | --- | --- |
| 지원자 관리 | `created_at ASC, id ASC` | 30개 / 해당 프로젝트의 미삭제 지원 |
| 내 지원 현황 | `created_at DESC, id DESC` | 30개 / 본인의 미삭제 지원 |
| 알림 | `created_at DESC, id DESC` | 30개 / 본인 수신 미삭제 알림 |

`?page=N`은 파싱 후 1~100,000으로 제한한다. 지원자·내 지원 목록은 전체 건수와 페이지 번호를 표시한다. 알림 미확인 건수는 모든 페이지를 포함한다. 일시는 `Asia/Seoul`, 금액은 원 단위로 표시한다.

## 3. 화면·Server Action 입출력

### 3.1 APP-01~03 지원 제출

`submitApplication(projectId, previousState, formData): Promise<ApplyState>`

| 입력 | 검사 |
| --- | --- |
| `projectId` | UUID 형식. DB에서 프로젝트 존재·삭제 여부 재검사 |
| `cover_letter` | 문자열, trim 후 1~5,000자 |
| `proposed_amount` | 숫자로 변환, 안전한 정수 1~999,999,999,999 |
| `proposed_days` | 숫자로 변환, 정수 1~3,650 |

권한은 활동 중인 프리랜서이며 본인 프로젝트 지원은 금지한다. 프로필 이름이 공백이면 `/me/profile?next=%2Fprojects%2F<id>%2Fapply`로 보낸다. 화면은 기존 지원·모집 상태를 검사하고 최종 DB 제출에서 모집 시각도 확인한다.

정상 처리: `submit_application` 호출 → 프로젝트 상세·지원자 관리·내 지원 현황·알림 경로 재검증 → `/me/applications`로 이동. 실패: `{ error, values }` 반환. 작성 내용을 오류 재표시에 사용하며 보존할 자기소개는 최대 5,000자로 제한한다. 전송 중 제출 버튼을 비활성화한다.

### 3.2 APP-04~06 지원자 열람·결정

`decideApplication(projectId, applicationId, decision, previousState, formData): Promise<ActionState>`

- `decision`: `accept` 또는 `reject`. UUID·의뢰인 역할·프로젝트 소유자·지원서의 프로젝트 일치를 검사한다.
- 수락은 `agreed_amount`를 정수 1~999,999,999,999로 검사해 RPC에 전달한다. 기본값은 지원자의 예상 금액이다. 거절은 지원 ID만 전달한다.
- 자동 거절 확인 체크는 브라우저 제출 전 필수다. 서버로 확인값을 따로 저장하지 않으며 권한 검사를 대신하지 않는다.
- 정상 반환은 `{ success }`, 실패는 `{ error }`. UI는 경로 재검증으로 변경된 상태를 표시한다. 수락·거절 처리 중 두 결정 버튼을 비활성화한다.
- 성공 후 프로젝트 상세·목록·지원자 관리·내 지원 현황·알림 경로를 재검증한다.
- 목록은 이름·공개 프로필 링크·제안 금액·기간·일시·상태·거절 이유·선정 금액을 표시하고 지원서는 펼쳐 본다. 이름이 없으면 지원자 순번으로 대체한다.
- `pending` 지원 + `recruiting` 프로젝트일 때만 결정 폼을 표시한다. 소유자 외 화면 접근은 404다.

### 3.3 APP-08 내 지원 현황

본인 지원만 조회한다. 제출 내용·금액·기간·상태·거절 이유를 보존하며 수락 시 협의 시작 금액과 `/contracts` 링크를 표시한다. 프로젝트 제목을 조회할 수 없으면 `프로젝트 지원 내역`으로 대체한다. 프로젝트 상세 접근 가능 여부는 2번 정책에 따른다. 수정·철회·삭제·재지원 UI는 없다.

### 3.4 NTF-02~04 읽음·이동

| 액션 | 입력 | 처리 | 출력 |
| --- | --- | --- | --- |
| `readNotification(formData)` | `notification_id` UUID | 본인 알림 조회, 미확인일 때만 `read_at=현재 시각` 저장 | 루트 layout 재검증 후 DB에 저장된 안전한 link로 이동 |
| `readAllNotifications()` | 없음 | 본인의 미확인·미삭제 알림 전체를 한 UPDATE로 수정 | 루트 layout 재검증 후 `/notifications` 이동 |

이미 읽은 알림의 시각은 덮어쓰지 않는다. ID 오류는 `?error=invalid`, 조회·수정 실패는 `?error=read`로 알림 화면에 돌아간다. DB 오류 원문을 노출하지 않는다. 이동 주소는 폼에서 받지 않는다. `/` 다음이 영문·숫자·밑줄인 내부 주소만 허용하며 백슬래시·공백·제어문자를 차단한다. 잘못된 주소는 `/notifications`로 이동한다.

## 4. 데이터 명세

### 4.1 `public.applications` — 0300

| 컬럼 | 타입 / 기본값 | 필수 | 규칙·용도 |
| --- | --- | --- | --- |
| `id` | uuid / `gen_random_uuid()` | 예 | 기본키 |
| `project_id` | uuid | 예 | `projects.id` 외래키 |
| `freelancer_id` | uuid | 예 | `profiles.id` 외래키, 인증 사용자 |
| `cover_letter` | text | 예 | trim 길이 1~5,000 |
| `proposed_amount` | numeric(12,0) | 예 | 예상 금액 1~999,999,999,999 |
| `proposed_days` | integer | 예 | 예상 기간 1~3,650 |
| `status` | text / `pending` | 예 | `pending`, `accepted`, `rejected` |
| `reject_reason` | text | 아니오 | `manual`, `auto`, `closed`, `negotiation_failed` |
| `accepted_agreed_amount` | numeric(12,0) | 아니오 | 협의 시작 금액. 예상 금액과 범위 동일 |
| `accepted_at` | timestamptz | 아니오 | 수락 시각 |
| `created_at` | timestamptz / `now()` | 예 | 지원 생성 시각 |
| `updated_at` | timestamptz / `now()` | 예 | 업무 RPC에서 변경 시 갱신 |
| `deleted_at` | timestamptz | 아니오 | 소프트 삭제 |

- `UNIQUE(project_id,freelancer_id)`: 거절·소프트 삭제 후에도 중복 금지.
- 미삭제 accepted 행의 project_id 부분 유일 인덱스: 프로젝트당 선정 한 명.
- `status='rejected'`인 것과 `reject_reason IS NOT NULL`인 것이 항상 같아야 한다.
- 조회 인덱스: `(freelancer_id,created_at DESC)`, `(project_id,status)`.

### 4.2 `public.notifications` — 0301

| 컬럼 | 타입 / 기본값 | 필수 | 규칙·용도 |
| --- | --- | --- | --- |
| `id` | uuid / `gen_random_uuid()` | 예 | 기본키 |
| `user_id` | uuid | 예 | 수신자 `profiles.id` 외래키 |
| `type` | text | 예 | 필수 5종·확장 8종만 허용 |
| `title` | text | 예 | trim 길이 1~200 |
| `body` | text | 예 | 최대 2,000자, 빈 문자열 허용 |
| `link` | text | 예 | 최대 1,000자, 내부 경로, 제어문자·백슬래시 금지 |
| `read_at` | timestamptz | 아니오 | null이면 미확인 |
| `created_at` | timestamptz / `now()` | 예 | 생성 시각 |
| `deleted_at` | timestamptz | 아니오 | 소프트 삭제 |
| `event_key` | text | 아니오 | 사건 재시도 중복 방지 |

`UNIQUE(user_id,event_key)`로 같은 수신자의 같은 사건을 한 번만 저장한다. event_key가 null이면 호출마다 새 알림이다. 미삭제 행의 `(user_id,created_at DESC)` 및 미확인·미삭제 행의 user_id 부분 인덱스를 사용한다. DB의 경로 제약보다 JS 생성·클릭 검사가 엄격하므로 팀 호출자는 `/contracts/<uuid>` 같은 내부 주소를 사용한다.

## 5. RPC 입력·출력·부수 효과

0302는 접근 검사를 보완하고 0303은 최종 프로필 조건을 이름 필수로 교체한다. 0301만 읽고 bio/category/skills까지 필수라고 판단하지 않는다.

| 함수 | 입력 | 반환 | 실행 허용 |
| --- | --- | --- | --- |
| `application_member_is_active()` | 없음 | boolean | authenticated, 본인 활동 여부만 |
| `application_project_owned_by_me(p_project_id)` | uuid | boolean | authenticated, 소유 여부만 |
| `submit_application(p_project_id,p_cover_letter,p_proposed_amount,p_proposed_days)` | uuid, text, numeric, integer | 생성한 지원 UUID | 활동 중인 프리랜서 |
| `accept_application(p_application_id,p_agreed_amount)` | uuid, numeric | 수락한 지원 UUID | 활동 중인 프로젝트 의뢰인 |
| `reject_application(p_application_id)` | uuid | 거절한 지원 UUID | 활동 중인 프로젝트 의뢰인 |
| `close_project_applications(p_project_id)` | uuid | 이번에 거절한 pending 행 수 integer | 프로젝트 의뢰인 / service_role |
| `create_notification(p_user_id,p_type,p_title,p_body,p_link,p_event_key DEFAULT NULL)` | uuid, text×5 | 알림 UUID | service_role / 업무 함수 내부 |

### 5.1 제출 — APP-02

인증 → 프로젝트 행 잠금 → 프로젝트·프리랜서·이름 검사 → `recruiting` 및 `start <= now < end` 검사 → 입력·중복 검사 → pending 저장 → 의뢰인 알림 → UUID 반환. 모집 시각이 null이면 거부한다.

```ts
await supabase.rpc('submit_application', {
  p_project_id: projectId,
  p_cover_letter: coverLetter,
  p_proposed_amount: amount,
  p_proposed_days: days,
});
```

### 5.2 수락 — APP-05

1. 지원서의 프로젝트 ID 확인 후 프로젝트를 먼저 잠근다.
2. 의뢰인 소유·활동 상태·역할과 금액을 검사하고 지원 행을 잠근다.
3. 같은 대상·금액이 이미 수락됐고 프로젝트가 contract_pending이면 동일 ID를 반환한다.
4. 그 외에는 pending 지원·활동 중인 프리랜서·recruiting 프로젝트인지 검사한다.
5. 대상 accepted, `accepted_agreed_amount`, `accepted_at`, `updated_at`을 저장한다.
6. 다른 미삭제 pending 지원을 rejected/auto로 변경하고 각자 자동 거절 알림을 만든다.
7. 프로젝트를 contract_pending으로 변경하고 선정자와 의뢰인에게 수락 알림을 만든다.
8. 지원 UUID를 반환한다. 계약 테이블은 만들거나 수정하지 않는다.

```ts
await supabase.rpc('accept_application', {
  p_application_id: applicationId, p_agreed_amount: amount,
});
```

### 5.3 직접 거절 — APP-06

프로젝트 → 지원 순서로 잠그고 소유자·활동 상태·역할을 검사한다. pending + recruiting이면 rejected/manual과 알림을 저장한다. 동일한 직접 거절 재실행은 같은 ID만 반환한다. 다른 이유로 결정된 지원은 재처리하지 않는다.

```ts
await supabase.rpc('reject_application', { p_application_id: applicationId });
```

### 5.4 모집 마감 — APP-07, 2번 연결

**projects.status를 먼저 closed로 바꾸지 말고 아래 RPC 하나를 호출한다.**

```ts
const { data: rejectedCount, error } = await supabase.rpc(
  'close_project_applications', { p_project_id: projectId },
);
```

- 프로젝트 행을 잠그고 존재·삭제·호출자 권한을 검사한다.
- 의뢰인은 자기 recruiting 프로젝트를 수동 마감한다. service_role은 `recruit_end_at <= now()`도 필요하다. 시각 누락·이른 마감은 `NOT_DUE`다.
- pending → rejected/closed, 프로젝트 → closed, 미삭제 지원자 전원 → project_closed를 함께 저장한다. 기존 거절 사유는 유지한다.
- 권한·service_role 시각 조건을 통과한 이미 closed 프로젝트는 0 반환. 다른 상태는 `INVALID_PROJECT_STATUS`다.
- 최신 2번 코드는 수동·기간 만료 마감에 이 함수를 호출한다. 예정 상태의 시작 시각이 지난 경우 recruiting으로 보정한 뒤 수동 마감을 호출하는 것은 2번 처리다.

### 5.5 트랜잭션·동시 요청

각 업무 RPC 한 번이 한 트랜잭션이다. 알림 생성까지 하나라도 실패하면 전부 롤백한다. 프로젝트 행을 먼저 잠가 같은 프로젝트의 지원·선정·마감을 순서대로 처리한다. 유일 제약도 중복 지원·이중 선정을 막는다.

종료 시각이 지나도 상태가 recruiting이면 기존 지원의 수락·직접 거절은 가능하다. 수락과 마감이 겹치면 먼저 잠금을 얻고 성공한 작업의 상태를 후속 요청이 확인한다. 초 단위의 자동 마감 완료를 보장하지 않는다.

## 6. 알림 공용 인터페이스와 사건 키

### 6.1 NTF-07 `createNotification`

```ts
import { createNotification } from '@/lib/notifications';
const notificationId = await createNotification({
  userId: recipientId,
  type: 'amount_proposed',
  title: '새 금액 제안이 도착했습니다',
  body: '계약 내용을 확인해 주세요.',
  link: `/contracts/${contractId}`,
  eventKey: `amount-proposed:${proposalId}`, // 선택. 같은 사건은 같은 키
}); // Promise<string>: 알림 UUID
```

eventKey만 선택이며 나머지는 필수다. 서버 전용이고 범용 Server Action으로 공개하지 않는다. 호출자가 업무 권한·수신자를 먼저 검증한다. 환경 변수 누락·길이/경로 오류·저장 실패는 예외로 반환한다. 서버의 `SUPABASE_SERVICE_ROLE_KEY`를 사용하며 브라우저로 전달하지 않는다.

계약·결제 저장 뒤 JS 알림을 별도로 호출하면 한 트랜잭션이 아니다. 여러 변경과 묶는 알림은 해당 업무 RPC **안에서** 다음 함수를 호출한다. 같은 사건을 JS·SQL 양쪽에서 중복 발송하지 않는다.

```sql
perform public.create_notification(
  recipient_id, 'amount_proposed', '새 금액 제안이 도착했습니다',
  '계약 내용을 확인해 주세요.', '/contracts/' || contract_id,
  'amount-proposed:' || proposal_id
);
```

### 6.2 NTF-01 사건별 저장

| type | 수신자 | link | event_key |
| --- | --- | --- | --- |
| `application_submitted` | 의뢰인 | `/projects/<projectId>/applicants` | `submitted:<applicationId>` |
| `application_accepted` | 선정자 | `/me/applications` | `accepted:<applicationId>` |
| `application_accepted` | 의뢰인 | `/projects/<projectId>/applicants` | `accepted-owner:<applicationId>` |
| `application_auto_rejected` | 다른 대기자 | `/me/applications` | `auto:<applicationId>` |
| `application_rejected` | 직접 거절 대상 | `/me/applications` | `manual:<applicationId>` |
| `project_closed` | 미삭제 지원자 전원 | `/me/applications` | `closed:<applicationId>` |

허용된 확장 type은 `amount_proposed`, `amount_agreed`, `amount_declined`, `contract_signed`, `payment_completed`, `delivery_requested`, `delivery_approved`, `review_requested`다. 저장 허용값이며 3번이 해당 계약·결제 사건까지 구현했다는 뜻은 아니다.

## 7. 권한·오류 명세

RLS는 API로 직접 요청해도 사용자별로 볼 수 있는 행을 제한하는 DB 정책이다.

| 자원 | 일반 로그인 사용자 권한 | 제한 |
| --- | --- | --- |
| applications SELECT | 본인 지원 / 프로젝트 의뢰인 | 활동 중인 회원, 미삭제 행 |
| applications 쓰기 | 직접 INSERT/UPDATE/DELETE 불가 | 인증·권한을 검사하는 RPC 경유 |
| notifications SELECT | 수신자 본인 | 활동 중인 회원, 미삭제 행 |
| notifications UPDATE | 본인 행의 read_at만 | USING·WITH CHECK로 행 제한, 다른 컬럼 수정 불가 |
| notifications INSERT/DELETE | 직접 실행 불가 | 위조 발송·물리 삭제 UI 없음 |
| create_notification EXECUTE | 일반 사용자 불가 | service_role 또는 업무 함수 내부 |

`application_project_owned_by_me`는 프로젝트 목록 공개 정책에 가려지지 않고 소유 여부만 확인한다. 프로젝트가 모집 중이 아니어도 의뢰인의 지원서 열람 권한은 유지한다. 특권 함수는 SECURITY DEFINER·빈 search_path·명시적 스키마를 사용하고 PUBLIC·anon의 실행 권한을 회수한다. 업무 함수는 인증·역할·활동 상태·소유자를 내부에서 검사한다.

| 오류 코드 | 화면 대응·의미 |
| --- | --- |
| `AUTH_REQUIRED` | 로그인 필요 |
| `FREELANCER_REQUIRED` | 프리랜서 계정으로 이용 |
| `OWNER_REQUIRED` | 프로젝트 의뢰인만 처리 |
| `PROJECT_NOT_FOUND`, `APPLICATION_NOT_FOUND` | 대상 없음 안내 |
| `PROFILE_INCOMPLETE` | 프로필 입력 후 지원 복귀 |
| `RECRUITMENT_CLOSED` | 현재 지원·결정 불가 |
| `ALREADY_APPLIED` | 이미 지원, 내 지원 현황 확인 |
| `APPLICATION_ALREADY_DECIDED` | 이미 결정됨, 새로고침 안내 |
| `INVALID_INPUT` | 자기소개·금액·기간 확인 |
| `APPLICANT_UNAVAILABLE` | 활동하지 않는 지원자, 다른 지원자 확인 |
| `NOT_DUE`, `INVALID_PROJECT_STATUS` | 2번 마감 호출자가 처리할 업무 오류 |

3번 폼은 알려진 오류만 쉬운 문장으로 바꾸고 나머지는 공통 재시도 안내를 표시한다. DB 원문·키·토큰은 화면이나 문서에 싣지 않는다.

## 8. NTF-05~06 종·실시간 동작

| 컴포넌트 | 사용처 / 입력 |
| --- | --- |
| `NotificationBellWidget` | 현재 1번 Client Header용. props 없음, 인증·활동 상태 검사 |
| `NotificationBell` | 서버 컴포넌트용 대안. props 없음, 서버에서 최초 개수 조회 |
| `NotificationBellClient` | 내부 UI. `userId: string`, `initialCount: number \| null` |
| `NotificationLiveUpdates` | 목록. `userId: string`, `initialCount: number`, 변경 시 router.refresh |

1번의 헤더 연결 방법:

```tsx
import { NotificationBellWidget } from '@/components/notifications/notification-bell-widget';
// 기존 data-slot="header-notifications" 자리에 삽입
<NotificationBellWidget />
```

서버 전용 모듈을 참조하는 NotificationBell을 현재 Client Header에 직접 import하지 않는다. 헤더 수정은 1번 담당이며 이번 문서화에서는 수정하지 않았다.

- 본인 user_id로 필터링한 notifications 변경 이벤트를 구독한다. 채널 이름에 사용자·인스턴스 ID를 넣으며 RLS도 적용한다.
- 이벤트를 200ms로 묶고 개수를 재조회한다. 진행 중 요청은 하나로 제한하고 새 사건이 오면 오래된 결과를 버리고 다시 조회한다.
- 최초 진입·연결 복구·포커스·온라인 복귀·탭 재표시 때 확인한다. 보이는 탭은 30초마다 보완 조회한다.
- 목록 구독은 종과 독립적이다. 공통 헤더 삽입 전에도 목록 자체 갱신 코드가 있다.
- 종은 0도 표시, 100 이상 `99+`, 아직 모르거나 실패하면 `!`. 오프라인은 툴팁·목록 연결 안내로 표시한다.
- 로그아웃·계정 변경·화면 이탈 시 채널·인증 구독·이벤트·타이머를 정리하고 이전 계정의 늦은 응답을 버린다.
- 0301은 supabase_realtime publication이 있을 때 notifications를 추가한다. 실제 publication 설정·이벤트 전달은 공용 환경에서 별도 확인한다.

## 9. 설치 전제와 팀 연결

| 전제·담당 | 명세 |
| --- | --- |
| 선행 테이블 | 1번 profiles, 2번 projects. UUID 키와 TEAM.md 필드 필요 |
| 3번 SQL 순서 | `0300_applications.sql` → `0301_notifications.sql` → `0302_application_access.sql` → `0303_profile_completion.sql` |
| 기존 적용 SQL | 권한 있는 담당자가 적용 상태 확인 후 미적용 파일만 실행. 사용자 확인상 이미 적용된 0200·0201 재실행 금지 |
| 최신 2번 변경 | main에 0202·0203 소스 존재. 2번 기록은 공용 0203 적용을 보고함. 이번 3번 작업에서 DB를 재검증한 것은 아님 |
| 0203 연계 | 수락·마감은 특권 함수 안의 상태 변경이므로 일반 사용자 직접 변경 제한과 연계. 공용 통합 확인 필요 |
| 일반 앱 환경 | NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SITE_URL |
| 서버 알림·자동 마감 | SUPABASE_SERVICE_ROLE_KEY. 일반 사용자의 지원·결정 RPC와 읽음에는 사용하지 않음 |
| 1번 | 헤더 종 삽입, 프로필 next 복귀, SQL 실행 권한·환경 준비 |
| 2번 | 지원/관리 링크와 마감 호출. 현재 자동 전환은 화면 조회 후 실행, 30초 간격 제한·만료 대상 최대 50개 조회. 상시 예약 실행 아님 |
| 4번 | 수락 application ID·선정 금액으로 계약 연결, 중복 방지, 합의 결렬 시 지원·프로젝트·알림을 한 RPC로 처리. 자동 거절 지원은 복구하지 않음 |
| 4·5번 | 단독 알림은 JS 함수, 업무 변경과 묶는 알림은 업무 RPC 내부 SQL 함수 |

비밀 값은 .env.local에 두고 Git에 올리지 않는다. 문서에는 변수 이름만 기록한다. 3번은 계약 생성·합의 결렬 실행·결제·납품·리뷰·프로젝트 등록을 대신 구현하지 않는다.

## 10. 검증 명세와 기록

### 10.1 수용 기준

| 항목 | 확인 방법 | 기대 결과 |
| --- | --- | --- |
| 정상 지원 | 이름 있는 프리랜서, 모집 중, 유효 입력 | pending 1건·의뢰인 알림 1건·현황 이동 |
| 프로필 복귀 | 이름 없는 회원이 이름만 저장 | 원래 지원 주소 복귀, 선택 항목 때문에 반복 이동 없음 |
| 중복·입력 경계 | 재지원, 빈 소개, 소수 금액, 기간 초과 | 추가 지원 없음, 오류 안내 |
| 모집 조건 | 예정·시각 경과·시각 누락·마감 | 지원·알림 생성 거부 |
| 소유자 제한 | 다른 회원으로 지원서 조회·결정 | 화면·DB 모두 비공개 정보·처리 차단 |
| 한 명 선정 | 의뢰인 1·프리랜서 2 지원 후 수락 | accepted 1, 다른 지원 auto, contract_pending, 대상별 알림 |
| 재시도·이중 선정 | 같은 수락 재시도·다른 지원 수락 | 중복 알림 없음, 이중 선정 거부 |
| 직접 거절 | pending 거절 및 재시도 | manual 유지, 알림 한 번 |
| 모집 마감 | pending·기존 manual 지원 함께 마감 | pending만 closed 사유, 기존 사유 유지, 전원 알림 |
| 마감 재호출 | 같은 권한으로 closed 재호출 | 0 반환·중복 알림 없음. service_role 시각 조건 적용 |
| 원자적 처리 | 임시 DB에서 알림 저장 실패 유도 | 지원·프로젝트 변경도 롤백 |
| 개인정보 | 다른 계정으로 지원·알림 API 접근 | 권한 없는 행 조회·변경 불가 |
| 읽음 | 본인 알림 선택·재선택·모두 읽음 | 첫 읽음 시각 유지, 내부 주소 이동, 다른 회원 변화 없음 |
| 페이지 | 30개 초과 목록 조회 | 정렬·이전/다음 정상, 모두 읽음은 전체 적용 |
| 실시간 | 다른 계정에서 지원·읽음 발생 | 새로고침 없이 본인 종·목록 갱신, 연결 복구 후 재조회 |
| 계정 변경 | 지연 조회 중 로그아웃·전환 | 이전 계정 숫자·데이터가 새 계정에 남지 않음 |
| 계약 인계 | 4번 코드에서 선정 정보 조회 | 지원 ID·선정 금액 일치, 수락만으로 계약 완료 표시하지 않음 |

### 10.2 기존 확인과 한계

2026-11-24 [최종 검증 기록](../sprints/2026-11-24-3-final.md) 기준:

| 검사 | 결과 | 범위 |
| --- | --- | --- |
| 임시 DB·RLS·RPC | 72개 통과 | PGlite, 실제 0100·0200·0201·0300~0303. 0202·0203은 이 검사에 미포함 |
| 구독 수명·경합·복구 | 38개 통과 | 가짜 시계·지연 응답으로 해제·오래된 결과 차단 확인 |
| SDK 서비스 흐름 | 22개 통과 | 로컬 API 대역·임시 DB, 시연 프로젝트 3개. 공용 DB 성공 아님 |
| 브라우저 시연 | 주요 흐름 확인 | 로컬 세 계정·프로필 복귀·선정·알림·읽음·WebSocket 대역 갱신 |
| 공용 API | 프로젝트 조회·시연 두 계정 로그인 성공 | 지원·알림 PGRST205, 회원 RPC PGRST202, 관리 SQL 권한 거절. 마지막 직접 확인 11-24 |

기본 fixture.mjs는 0202·0203을 로드하지 않는다. 최신 프로젝트·상태 가드의 통합까지 72개 검사로 보장하지 않는다. 2번은 별도 [권한 검사 기록](../sprints/2026-11-24-2-rls-check.md)에 0203과 수락·마감의 임시 DB 확인을 보고했다. 공용 세 계정 시연·실제 Supabase Realtime 수신·계약 연계는 미확인이다.

### 10.3 재현 방법

저장소 루트에서 실행한다. PGlite는 외부 검증 폴더에 설치하고 WORKBRIDGE_PGLITE_MODULE에 해당 dist/index.js 절대 경로를 지정한다. 실제 계정 JSON은 저장소 밖에 둔다.

```bash
# 임시 DB·구독 검사: 공용 DB를 변경하지 않음
node src/components/applications/tests/database.mjs
node src/components/notifications/tests/subscription.mjs

# 앱 빌드
npm run build

# 공용 환경 준비 검사만
node --env-file=.env.local src/components/applications/tests/live-smoke.mjs
```

공용 시연은 별도 `--run`으로 실제 프로젝트·지원·알림을 남긴다. SQL·세 계정·권한을 준비한 뒤 [실행 환경·전체 방법](../sprints/2026-11-24-3-final.md#공용-supabase-검증-실행)을 따른다. 이번 문서 작성에서는 공용 시연이나 SQL을 실행하지 않았다.

### 10.4 이번 문서화 확인 — 2026-11-25

- 최신 main 028186c를 3번 브랜치에 반영하고 화면·액션·최종 SQL·구독 코드를 대조했다.
- 기존의 미수령 환경 변수·미연결 프로젝트 화면 설명을 갱신했다. 실제 공용 지원·알림 검증은 미확인 상태로 유지했다.
- 상대 링크·제목 앵커 11개, 기능 ID 15개, 코드 블록 닫힘·키 형식 포함 여부 검사를 통과했다. 화면·액션·SQL 경로는 실제 소스와 대조했다.
- 최신 main 반영 후 `npm run build` 성공. TypeScript 검사와 전체 20개 페이지 생성이 완료됐다. 문서 변경이므로 기존 DB·구독·브라우저 검사는 이번에 다시 실행하지 않았다.
- 이번 명세 작성으로 구현 파일·DB 스키마·다른 담당자의 문서를 수정하지 않는다.

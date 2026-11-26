# WorkBridge 세부명세서 — 4번 AI 참고 견적·금액 합의·계약·서명

| 항목 | 내용 |
| --- | --- |
| 버전 / 기준일 | 1.0 / 2026-11-26, 한국 시간 |
| 범위 | 4번 화면·Server Action·DB 함수·권한·알림·팀 연결 |
| 상위 문서 | [기능명세서](./4-ai-contract.md) |
| 준수 문서 | `docs/TEAM.md`, `docs/decisions/2026-11-25-4-amount-agreement.md` |
| 확인 기록 | [시연 설명과 계약 조회](../sprints/2026-11-25-4-validation.md) |

기능 범위는 상위 문서가 정합니다. 이 문서는 현재 코드와 SQL이 그 범위를 어떻게 지키는지 적습니다. 상태값 이름은 `docs/TEAM.md` 2장을 그대로 씁니다.

## 1. 구현 구성

| 기능 | 소스 | 책임 |
| --- | --- | --- |
| 견적 화면 | `src/app/ai-estimate/[projectId]/page.tsx` | 의뢰인 확인, 최근 견적 표시 |
| 견적 동작 | `src/app/ai-estimate/[projectId]/actions.ts` | `createEstimate`, `applyEstimateToBudget` |
| 견적 검사 | `src/components/ai/estimate-schema.ts` | zod로 기능 목록과 총액 검사 |
| 견적 요청 | `src/components/ai/generate-estimate.ts` | 서버에서만 OpenAI 호출. `server-only` |
| 등록 버튼 | `src/components/ai/estimate-button.tsx` | 2번 폼에 끼우는 버튼. 2번 파일은 아직 이 버튼으로 바뀌지 않음 |
| 계약 목록·상세 | `src/app/contracts/page.tsx`, `src/app/contracts/[id]/page.tsx` | 당사자 목록, 서명, 결제 이동 |
| 계약 동작 | `src/app/contracts/actions.ts` | 동의, 거부, 서명 |
| 표·조회 | `supabase/migrations/0400_ai_estimates.sql`, `0401_contracts.sql` | 표, RLS, 변경 금지 트리거 |
| 저장·합의 | `0402_save_ai_estimate.sql`, `0403_contract_agreement.sql` | 저장과 동의·거부·서명 함수 |

SQL 순서는 `0400`, `0401`, `0402`, `0403` 입니다. `0402`는 `0401`과 독립이고, `0403`은 `0401`과 3번의 `create_notification` 다음입니다.

## 2. 공통 진입

1. Supabase 공개 주소와 anon 키가 없으면 연결 준비 안내를 보여 줍니다. 조회가 실패하면 오류 경계의 다시 시도 버튼이 나옵니다.
2. 주소의 프로젝트 id와 계약 id는 UUID만 받습니다. 형식이 아니면 404입니다.
3. 로그인하지 않았으면 `/login?next=<현재 주소>`로 보냅니다. 역할이 없으면 역할 선택, 이름이 비어 있으면 `/me/profile?next=<현재 주소>`로 보냅니다.
4. 견적 화면은 역할이 `client`가 아니거나 그 프로젝트의 `client_id`가 아니면 404입니다.
5. 계약 상세는 RLS 때문에 당사자가 아니면 행이 없고, "이 계약을 볼 수 없습니다"만 보여 줍니다. 금액은 나오지 않습니다.
6. 사용자 id는 폼에서 받지 않습니다. 금액, 시작일, 종료일도 브라우저 값을 쓰지 않습니다.

## 3. 화면·Server Action 입출력

### 3.1 참고 견적

`createEstimate(previousState, formData): Promise<EstimateState>`

| 입력 | 검사 |
| --- | --- |
| `project_id` | UUID. 저장된 프로젝트의 의뢰인인지 다시 확인 |
| 설명 | 폼으로 받지 않음. `projects.description`을 서버가 읽음. 앞뒤 공백을 빼고 5,000자까지만 사용. 10자 미만이면 저장하지 않음 |

호출은 `https://api.openai.com/v1/chat/completions` 입니다. 모델은 `gpt-4o-mini`, temperature `0.2`, 최대 토큰 4000, 제한 시간 45초입니다. 키는 서버 환경 변수 `OPENAI_API_KEY`만 씁니다. Vercel AI SDK 패키지는 쓰지 않습니다. 키가 없거나 401·403이면 "견적을 만들 준비가 되지 않았습니다"를 보여 주고 저장하지 않습니다. 응답이 비거나 검사에 실패하면 한 번 더 요청하고, 그래도 실패하면 저장하지 않습니다.

통과한 값만 `save_ai_estimate(p_project_id, p_items, p_total_amount)`로 넣습니다. 성공하면 같은 견적 화면으로 돌아갑니다. 화면은 가장 최근 한 줄만 보여 줍니다. 예전 줄은 고치지 않습니다.

화면에 보이는 칸은 기능명, 설명, 예상 단가, 산정 근거, 전체 총액입니다. 이 금액은 계약 금액이 아니라고 적습니다.

### 3.2 예산에 반영

`applyEstimateToBudget(previousState, formData)`

프로젝트 id만 받습니다. 최근 견적의 `total_amount`를 서버가 읽어 `projects.budget`만 바꿉니다. 브라우저가 보낸 숫자를 예산으로 쓰지 않습니다.

바꾸는 조건은 상태가 `scheduled` 또는 `recruiting`이고, 2번의 화면 상태가 모집 마감이 아니고, `project_applicant_counts`가 0인 경우입니다. 지원자가 있거나 모집이 끝났으면 견적은 그대로 두고 예산만 거절합니다. 2번이 프로젝트 수정에 걸어 둔 검사도 지원자가 있으면 `HAS_APPLICANTS`로 막습니다.

### 3.3 동의·거부

목록 `/contracts`는 내가 볼 수 있는 계약을 모두 보여 줍니다. 상태 필터가 없어 체결된 계약도 남습니다. 계약이 아직 없는 `accepted` 지원은 따로 보여 줍니다. 그 지원의 프리랜서에게만 동의·거부 버튼이 있고, 의뢰인에게는 대기 안내와 지원자 관리 링크가 있습니다.

`agreeToAmount`는 `application_id`만 받아 `agree_contract_amount`를 호출하고 `/contracts/<계약 id>`로 이동합니다.

`declineAmount`는 같은 id로 `decline_contract_amount`를 호출하고 `/contracts`로 이동합니다.

### 3.4 서명

`signContract`는 `contract_id`와 체크박스 `confirm=on`이 있어야 `sign_contract`를 호출합니다. 체크가 없으면 "내용을 확인했다면 서명 칸을 체크해 주세요"만 반환하고 함수를 부르지 않습니다. 한 사람당 체크박스는 하나입니다.

`signing`이고 내 서명 시각이 없으면 서명 폼이 나옵니다. 내 서명만 있으면 상대방을 기다린다는 문장이 나옵니다. `signed`이면 "결제 화면으로 이동"이 `/payments/<계약 id>`로 갑니다. 결제 자체는 5번입니다. `signing`에서는 이 버튼이 없습니다.

## 4. 데이터 명세

### 4.1 `public.ai_estimates` — 0400

| 컬럼 | 타입 | 규칙 |
| --- | --- | --- |
| `id` | uuid | 기본키 |
| `project_id` | uuid | `projects.id` |
| `client_id` | uuid | `profiles.id`. 그 프로젝트의 의뢰인과 같아야 함 |
| `items` | jsonb | 배열. 표 제약은 100개 이하 |
| `total_amount` | bigint | 표 제약은 0 이상 999,999,999,999 이하 |
| `created_at` | timestamptz | 생성 시각 |
| `deleted_at` | timestamptz | 소프트 삭제 |

표 제약은 느슨합니다. 실제로 저장되는 모양은 함수와 zod가 더 좁게 막습니다. 기능은 1~12개, 이름은 1~80자, 설명은 1~400자, 산정 근거는 1~300자, 단가는 10,000~500,000,000의 정수, 총액은 단가 합과 같고 10,000~999,999,999,999입니다. 소수, 0, 음수, 빈 칸, 합계 불일치는 저장하지 않습니다. 숫자만 있는 문자열은 정수로 받은 뒤 검사합니다.

조회 정책 `ai_estimates_select_own_client`는 로그인 사용자에게만 SELECT를 줍니다. 조건은 삭제되지 않은 행, 계정이 살아 있음, `client_id`가 본인, 그 프로젝트의 의뢰인이 본인입니다. 브라우저의 insert·update는 없습니다.

만든 뒤 `items`, `total_amount`, 프로젝트, 의뢰인, 생성 시각은 트리거가 바꾸지 못하게 합니다.

### 4.2 `public.contracts` — 0401

| 컬럼 | 타입 | 규칙 |
| --- | --- | --- |
| `id` | uuid | 기본키 |
| `project_id`, `application_id` | uuid | 프로젝트와 수락된 지원 |
| `client_id`, `freelancer_id` | uuid | 서로 달라야 함. 프로젝트 의뢰인, 그 지원의 프리랜서와 같아야 함 |
| `agreed_amount` | numeric(12,0) | 비어 있거나 1~999,999,999,999 |
| `status` | text | `negotiating`, `signing`, `signed`, `cancelled`. 기본값 `negotiating` |
| `client_signed_at`, `freelancer_signed_at` | timestamptz | `signing`은 둘 중 하나 이상이 비어 있음. `signed`는 둘 다 있어야 함 |
| `start_date`, `end_date` | date | `signing`과 `signed`는 둘 다 필요하고 종료일이 시작일보다 앞설 수 없음 |
| `created_at`, `updated_at`, `deleted_at` | timestamptz | 수정 시각은 트리거가 갱신 |

지워지지 않은 계약은 지원서당 하나입니다. 취소가 아닌 계약은 프로젝트당 하나입니다.

조회 정책 `contracts_select_parties`는 삭제되지 않은 행이고, 계정이 살아 있고, `client_id` 또는 `freelancer_id`가 본인일 때만 SELECT를 줍니다. 브라우저의 insert·update는 없습니다.

## 5. RPC

모두 `security definer`이고 `search_path`는 비어 있습니다. `authenticated`만 실행할 수 있습니다. 프로젝트 행을 먼저 잠급니다. 함수 안의 알림까지 한 트랜잭션입니다.

| 함수 | 입력 | 반환 | 호출자 |
| --- | --- | --- | --- |
| `save_ai_estimate` | uuid, jsonb, bigint | 견적 uuid | 그 프로젝트의 살아 있는 의뢰인 |
| `agree_contract_amount` | 지원 uuid | 계약 uuid | 선정된 프리랜서 |
| `decline_contract_amount` | 지원 uuid | 지원 uuid | 선정된 프리랜서 |
| `sign_contract` | 계약 uuid | 계약 uuid | 그 계약의 의뢰인 또는 프리랜서 |

### 5.1 저장

인증 → 활동 계정 → 프로젝트가 있고 삭제되지 않음 → 호출자가 `client_id` → 기능 목록과 총액 검사 → 새 행 insert. 실패 코드는 `ESTIMATE_INVALID`입니다. 화면은 이 코드와 그 밖의 저장 실패를 같은 "다시 시도" 문장으로 보여 줍니다. 함수가 없으면 `0402`를 실행하라는 문장을 보여 줍니다.

### 5.2 동의

인증 → 활동 중인 프리랜서 → 지원과 프로젝트를 잠금 → 이미 살아있는 계약이 있으면 그 id만 반환합니다. 계약과 알림을 다시 만들지 않습니다.

없을 때는 프로젝트가 `contract_pending`, 지원이 `accepted`, `accepted_agreed_amount`가 1 이상의 정수여야 합니다. 시작일은 동의 시각의 한국 날짜입니다. 종료일은 그 날짜에 `proposed_days`를 더한 날입니다. 상태 `signing`으로 한 줄을 만들고 의뢰인에게 `amount_agreed`를 보냅니다. 프로젝트는 `contract_pending` 그대로입니다.

### 5.3 거부

이미 그 지원이 `rejected` / `negotiation_failed`이고 프로젝트가 `recruiting`이면 같은 지원 id만 반환합니다. 다른 지원은 건드리지 않습니다.

살아 있는 계약이 있으면 `CONTRACT_ALREADY_CREATED`입니다. 그 외에는 그 지원만 `rejected` / `negotiation_failed`로 바꾸고 프로젝트를 `recruiting`으로 바꿉니다. `auto`, `manual`, `closed` 지원은 조회만 하고 수정하지 않습니다. 의뢰인에게 `amount_declined`를 보냅니다. 계약 줄은 만들지 않습니다.

프로젝트 상태를 화면이 직접 바꾸면 2번의 검사가 막습니다. 그래서 모집 중으로 되돌리는 일은 이 함수 안에서만 합니다.

### 5.4 서명

당사자가 아니면 `NOT_A_PARTY`입니다. 이미 `signed`이면 id만 반환하고 알림을 다시 만들지 않습니다. `signing`이 아니면 `CONTRACT_NOT_SIGNING`입니다. 내 서명 시각이 이미 있으면 id만 반환합니다.

내 시각만 채웁니다. 둘 다 채워지면 같은 UPDATE에서 `signed`가 되고, 의뢰인과 프리랜서에게 `contract_signed`가 하나씩 갑니다. 금액, 시작일, 종료일, 이미 있는 서명 시각은 바꾸지 않습니다. 한쪽만 서명하면 상태는 `signing`이고 알림은 없습니다.

## 6. 알림

화면은 `createNotification()`을 따로 부르지 않습니다. 여러 표를 바꾸는 일이라 3번 함수 `public.create_notification`을 RPC 안에서 호출합니다. JS 함수도 같은 SQL 함수를 감쌉니다.

| type | 언제 | 수신자 | link | event_key |
| --- | --- | --- | --- | --- |
| `amount_proposed` | 지원이 `accepted`로 바뀌고 수락 금액이 있을 때. `0403` 트리거 | 프리랜서 | `/contracts` | `amount-proposed:<지원 id>` |
| `amount_agreed` | 동의로 계약이 생길 때 | 의뢰인 | `/contracts/<계약 id>` | `amount-agreed:<계약 id>` |
| `amount_declined` | 거부 | 의뢰인 | `/projects/<프로젝트 id>/applicants` | `amount-declined:<지원 id>` |
| `contract_signed` | 양쪽 서명이 끝난 그 호출 | 의뢰인, 프리랜서 각각 | `/contracts/<계약 id>` | `contract-signed:<계약 id>:client`, `:freelancer` |

`amount_proposed` 트리거는 3번 `accept_application`이 지원 상태를 바꾼 같은 트랜잭션에서 실행됩니다. 3번 파일은 고치지 않습니다. 수락이 되돌아가면 이 알림도 함께 되돌아갑니다.

## 7. 권한·오류

| 코드 | 화면 문장 |
| --- | --- |
| `NOT_THE_FREELANCER` | 선정된 프리랜서만 동의하거나 거부할 수 있습니다. |
| `CONTRACT_ALREADY_CREATED` | 이미 계약서가 만들어진 뒤에는 거부할 수 없습니다. |
| `PROJECT_NOT_IN_CONTRACT` | 계약 대기 중인 프로젝트에서만 할 수 있습니다. |
| `APPLICATION_NOT_ACCEPTED` | 수락된 지원만 동의하거나 거부할 수 있습니다. |
| `AMOUNT_MISSING` | 수락할 때 저장된 합의 금액이 없습니다. |
| `NOT_A_PARTY` | 이 계약의 당사자만 서명할 수 있습니다. |
| `CONTRACT_NOT_SIGNING` | 서명할 수 있는 계약이 아닙니다. |
| `ESTIMATE_INVALID` | 빠진 칸이나 이상한 금액이 있어 저장하지 않았습니다. 다시 시도해 주세요. |
| 함수 없음 | `0402` 또는 `0403`을 실행한 뒤 다시 시도해 주세요. |

로그인하지 않은 역할에는 두 표의 SELECT가 없습니다. 탈퇴 계정은 `ai_contract_member_is_active()`가 `profiles.deleted_at`을 보아 조회와 함수가 막습니다. 이 확인은 2026-11-25에 임시 PostgreSQL에서 했습니다. 팀 공용 데이터베이스의 다른 계정 로그인은 그 기록에 없습니다.

## 8. 팀 연결

- 3번 수락 화면이 `accept_application(p_application_id, p_agreed_amount)`로 `accepted_agreed_amount`를 저장합니다. 4번은 그 함수와 수락 화면을 고치지 않습니다. 금액 입력칸을 4번 화면에 만들지 않습니다.
- 2번 `src/components/projects/project-form.tsx`의 `data-slot="ai-estimate-button"`은 아직 비활성 버튼입니다. 바꿀 컴포넌트는 `AiEstimateButton`입니다. 등록 화면에는 프로젝트 번호가 없어 버튼이 눌리지 않고, 수정 주소 `/projects/<id>/edit`에서 `/ai-estimate/<id>`로 이동합니다.
- 5번 결제는 계약이 `signed`이고 프로젝트가 `contract_pending`일 때 시작합니다. 동의만 된 `signing`에서는 시작하지 않습니다.
- 납품 요청과 완료 승인 버튼은 5번 결제 화면에 있습니다. 계약 상세에는 넣지 않았습니다.

## 9. 확인과 한계

시연에 붙여 넣을 설명 세 개는 `docs/sprints/2026-11-25-4-validation.md`에 있습니다. 결과물이 여러 개인 빵집 예약, 학원 신청, 공방 소개입니다.

그 문서는 계약 2건을 넣고 로그인 역할을 바꿔 조회했습니다. 당사자는 자기 계약 1건만 봤고, 다른 의뢰인과 다른 프리랜서는 남의 계약을 0건으로 봤습니다. 로그인하지 않은 역할은 표를 열지 못했습니다. 의뢰인을 탈퇴 처리하면 그 계정은 0건이고, 같은 계약의 프리랜서는 1건이었습니다.

이 컴퓨터에는 `OPENAI_API_KEY`와 팀 데이터베이스 접속 정보가 없었습니다. 그래서 예시 설명으로 모델이 견적을 만든 화면과, 시연 계정 둘로 로그인해 보는 확인은 없습니다.

## 10. 이번 주에 만들지 않는 것

매니저, 미팅 예약, 금액 재제안, 플랫폼 서명, 도장 이미지, 종이 계약, 분할 지급, 선금, 부가세, 원천징수, 지식재산·비밀유지·하자·분쟁 조항 문장. 참고 견적을 수락 금액이나 계약 금액에 복사하는 기능도 없습니다.

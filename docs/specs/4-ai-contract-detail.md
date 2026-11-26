# 4번 세부 명세서: AI 참고 견적·금액 합의·계약·서명

기능 범위는 `docs/specs/4-ai-contract.md` 입니다. 금액 규칙을 이렇게 정한 이유는 `docs/decisions/2026-11-25-4-amount-agreement.md` 입니다. 이 문서는 그 기능을 파일, 입력, 실패 문구로 나눈 것입니다. 상태값 이름은 `docs/TEAM.md` 를 그대로 씁니다.

## 1. 담당 파일

| 경로 | 하는 일 |
| --- | --- |
| `src/app/ai-estimate/[projectId]/page.tsx` | 참고 견적 화면 |
| `src/app/ai-estimate/[projectId]/actions.ts` | 견적 생성, 예산 반영 |
| `src/app/ai-estimate/[projectId]/error.tsx` | 견적 화면이 깨졌을 때 다시 시도 |
| `src/components/ai/generate-estimate.ts` | OpenAI 호출. 서버에서만 |
| `src/components/ai/estimate-schema.ts` | 응답 칸과 금액 범위 검사 |
| `src/components/ai/estimate-panel.tsx` | 기능별 단가와 총액 표시 |
| `src/components/ai/estimate-button.tsx` | 2번 등록·수정 화면에 끼울 버튼 |
| `src/app/contracts/page.tsx` | 내 계약 목록, 동의·거부 |
| `src/app/contracts/[id]/page.tsx` | 계약서와 서명 |
| `src/app/contracts/actions.ts` | 동의, 거부, 서명 |
| `supabase/migrations/0400_ai_estimates.sql` | 참고 견적 표와 조회 권한 |
| `supabase/migrations/0401_contracts.sql` | 계약 표와 조회 권한 |
| `supabase/migrations/0402_save_ai_estimate.sql` | 견적 저장 함수 |
| `supabase/migrations/0403_contract_agreement.sql` | 동의, 거부, 서명 함수 |

3번 지원 화면과 2번 프로젝트 폼 파일은 고치지 않습니다. 2번 화면의 `data-slot="ai-estimate-button"` 에만 4번 버튼을 끼우면 됩니다.

## 2. 데이터베이스

표는 두 개입니다.

`ai_estimates`: `id`, `project_id`, `client_id`, `items`(jsonb), `total_amount`, `created_at`, `deleted_at`. 한 번 넣은 줄은 고치지 않습니다. 다시 분석하면 새 줄이 생깁니다.

`contracts`: `id`, `project_id`, `application_id`, `client_id`, `freelancer_id`, `agreed_amount`, `status`, `client_signed_at`, `freelancer_signed_at`, `start_date`, `end_date`, `created_at`, `updated_at`, `deleted_at`.

`items` 한 칸은 `name` 1~80자, `description` 1~400자, `unit_price` 정수 10,000~500,000,000원, `basis` 1~300자입니다. 기능은 1~12개입니다. `total_amount` 는 단가 합과 같아야 하고 10,000원 이상 999,999,999,999원 이하입니다.

계약 상태 값: `negotiating`, `signing`, `signed`, `cancelled`. 지금 동의 함수는 계약을 `signing` 으로 만듭니다. 양쪽 서명이 끝나면 `signed` 입니다.

한 번만 규칙:

- 취소되지 않은 계약은 프로젝트당 하나
- 살아 있는 계약은 지원서당 하나
- 의뢰인과 프리랜서는 서로 다른 회원

브라우저가 두 표에 직접 insert, update 하지 않습니다. 저장과 상태 변경은 함수만 합니다.

## 3. 참고 견적

주소 `/ai-estimate/[projectId]`. 그 프로젝트의 의뢰인만 봅니다.

들어가기 전에 서버가 확인합니다.

- 로그인하지 않았으면 `/login?next=/ai-estimate/[id]`
- 역할이 없으면 `/onboarding/role?next=...`
- 의뢰인인데 이름이 없으면 `/me/profile?next=...`
- 프리랜서이거나 다른 의뢰인이면 "이 프로젝트의 견적을 만들 수 없습니다."

만드는 순서:

1. 브라우저가 프로젝트 번호만 보냅니다. 설명과 금액은 보내지 않습니다.
2. 서버가 `projects.description` 을 읽습니다. 설명이 너무 짧으면 만들지 않습니다.
3. 서버가 `OPENAI_API_KEY` 로 `https://api.openai.com/v1/chat/completions` 를 호출합니다. 모델은 `gpt-4o-mini` 입니다. 이 키는 `NEXT_PUBLIC_` 가 아닙니다.
4. 응답을 `estimate-schema.ts` 로 검사합니다. 칸이 빠지거나 금액이 정수가 아니거나 총액이 단가 합과 다르면 저장하지 않습니다.
5. 통과한 값만 `save_ai_estimate` 로 넣습니다.

화면 문구는 "견적을 만들지 못했습니다. 빠진 칸이나 이상한 금액이 있어 저장하지 않았습니다. 다시 시도해 주세요." 입니다. 키가 없으면 "참고 견적 키가 서버에 없습니다." 입니다.

예산에 반영은 `applyEstimateToBudget` 입니다. 데이터베이스 함수가 아닙니다.

- 최근 참고 견적이 있어야 합니다.
- 프로젝트 상태가 `scheduled` 또는 `recruiting` 이고 모집 기간이 남아 있어야 합니다.
- 지원자가 있으면 예산을 바꾸지 않습니다.
- 바뀌는 칸은 `projects.budget` 뿐입니다. 지원 금액, 수락 금액, 계약 금액, 프로젝트 상태는 그대로입니다.

## 4. 동의, 거부, 서명

금액 입력칸은 4번 화면에 없습니다. 의뢰인은 3번 `/projects/[id]/applicants` 에서 수락할 때 `accepted_agreed_amount` 를 저장합니다. 4번은 그 숫자를 그대로 씁니다.

| 서버 동작 | 파일 | 입력 | 데이터베이스 함수 | 성공하면 |
| --- | --- | --- | --- | --- |
| `agreeToAmount` | `src/app/contracts/actions.ts` | `application_id` | `agree_contract_amount` | `/contracts/[새 계약 id]` |
| `declineAmount` | 같은 파일 | `application_id` | `decline_contract_amount` | `/contracts` |
| `signContract` | 같은 파일 | `contract_id`, 확인 체크 | `sign_contract` | 같은 계약서 |

공통으로, 로그인·역할·이름이 없으면 로그인, 역할 선택, 내 프로필로 보냅니다. 번호 형식이 아니면 "올바른 지원이 아닙니다." 또는 "올바른 계약이 아닙니다." 입니다. 서명 체크가 없으면 "내용을 확인했다면 서명 칸을 체크해 주세요." 입니다.

동의할 때 금액, 시작일, 종료일은 함수가 정합니다. 브라우저가 보낸 금액과 날짜는 쓰지 않습니다.

- 합의 금액 = `accepted_agreed_amount`
- 시작일 = 동의한 시각의 한국 날짜
- 종료일 = 시작일에 `proposed_days` 를 더한 날짜

동의 조건: 프로젝트가 `contract_pending`, 지원이 `accepted`, 금액이 1원 이상, 살아 있는 계약이 아직 없음. 성공하면 계약은 `signing` 이고 프로젝트는 `contract_pending` 그대로입니다. 작업 중으로 바꾸는 일은 5번 결제입니다.

거부 조건은 위와 같고 계약이 아직 없는 경우입니다. 성공하면 그 지원만 `rejected` / `negotiation_failed` 가 되고 프로젝트는 `recruiting` 으로 돌아갑니다. 이미 `auto`, `manual`, `closed` 인 지원은 건드리지 않습니다.

서명 조건: 상태가 `signing` 이고 내 서명 시각이 비어 있음. 한쪽만 서명하면 알림이 없습니다. 양쪽이 채워지면 같은 호출에서 `signed` 가 됩니다.

같은 지원으로 동의를 다시 호출하면 이미 만든 계약 번호를 돌려주고 새로 만들지 않습니다. 같은 사람이 서명을 다시 눌러도 시각은 바뀌지 않습니다. 거부 뒤에 동의, 체결된 계약의 거부, 상대 서명 시각을 바꾸는 호출은 실패합니다.

화면에 보이는 실패 문구:

| 데이터베이스가 내는 말 | 화면 |
| --- | --- |
| 함수가 없음 | 계약 기능이 아직 데이터베이스에 없습니다. 0403 SQL을 실행한 뒤 다시 시도해 주세요. |
| `NOT_THE_FREELANCER` | 선정된 프리랜서만 동의하거나 거부할 수 있습니다. |
| `CONTRACT_ALREADY_CREATED` | 이미 계약서가 만들어진 뒤에는 거부할 수 없습니다. |
| `PROJECT_NOT_IN_CONTRACT` | 계약 대기 중인 프로젝트에서만 할 수 있습니다. |
| `APPLICATION_NOT_ACCEPTED` | 수락된 지원만 동의하거나 거부할 수 있습니다. |
| `AMOUNT_MISSING` | 수락할 때 저장된 합의 금액이 없습니다. |
| `NOT_A_PARTY` | 이 계약의 당사자만 서명할 수 있습니다. |
| `CONTRACT_NOT_SIGNING` | 서명할 수 있는 계약이 아닙니다. |
| 대상을 못 찾음 | 대상을 찾지 못했습니다. |

다른 사람의 계약 주소는 "이 계약을 볼 수 없습니다"만 보여 줍니다. 금액은 보여 주지 않습니다.

## 5. 알림

화면이 알림을 따로 보내지 않습니다. 함수 안에서 3번의 `create_notification` 을 호출합니다.

| 때 | 받는 사람 | type | 이동 |
| --- | --- | --- | --- |
| 수락으로 금액이 저장됨 | 프리랜서 | `amount_proposed` | `/contracts` |
| 동의 | 의뢰인 | `amount_agreed` | `/contracts/[id]` |
| 거부 | 의뢰인 | `amount_declined` | `/projects/[id]/applicants` |
| 양쪽 서명 완료 | 의뢰인, 프리랜서 | `contract_signed` | `/contracts/[id]` |

## 6. 다른 번호와의 경계

- 5번 결제는 계약이 `signed` 이고 프로젝트가 `contract_pending` 일 때만 시작합니다. `signing` 에서는 시작하지 않습니다.
- 프로젝트 상태를 화면이 직접 바꾸면 2번의 상태 검사에 막힙니다. 모집 중으로 되돌리는 일은 거부 함수 안에서만 합니다.
- 납품 요청과 완료 승인 버튼은 5번 컴포넌트입니다. 계약 상세에 끼우는 일은 아직 남아 있습니다.

## 7. 이번 주에 만들지 않는 것

매니저, 미팅 예약, 금액 재제안, 도장 이미지, 종이 계약, 분할 지급, 선금, 부가세, 원천징수, 지식재산·비밀유지·하자·분쟁 조항.

## 8. 아직 확인하지 못한 것

- 공용 데이터베이스에 `0400`~`0403` 이 실행됐는지는 확인하지 않았습니다. 실행 전에는 화면이 열리고 저장은 실패합니다.
- `OPENAI_API_KEY` 가 없는 환경에서는 참고 견적 결과 화면을 확인하지 못했습니다. 시연용 설명 3개는 `docs/sprints/2026-11-25-4-validation.md` 에 있습니다.
- 남의 계약이 보이지 않는 확인은 임시 데이터베이스에서만 했습니다.

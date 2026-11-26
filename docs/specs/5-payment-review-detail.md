# WorkBridge 세부명세서 — 5번 결제·정산·리뷰

| 항목 | 내용 |
| --- | --- |
| 버전 / 기준일 | 1.0 / 2026-11-26, 한국 시간 |
| 범위 | 5번 화면·승인 API·DB 함수·권한·알림·팀 연결 |
| 상위 문서 | [기능명세서](./5-payment-review.md) |
| 준수 문서 | `docs/TEAM.md`, `docs/decisions/2026-11-24-payments.md` |
| 확인 기록 | [결제·정산·리뷰 확인](../sprints/2026-11-25-5-payment-check.md) |

기능 범위는 상위 문서가 정합니다. 이 문서는 현재 코드와 SQL이 그 범위를 어떻게 지키는지 적습니다. 월요일 명세에는 화면을 이어서 만든다고 되어 있었고, 아래 파일은 그 뒤에 들어와 있습니다.

## 1. 구현 구성

| 기능 | 소스 | 책임 |
| --- | --- | --- |
| 결제 화면 | `src/app/payments/[contractId]/page.tsx` | 금액 세 칸, 결제 준비, 테스트 결제, 납품·완료 |
| 결제 동작 | `src/app/payments/actions.ts` | 시작, 납품 요청, 완료 승인, 실패 기록 |
| 결제창 | `src/components/payments/pay-button.tsx` | 토스 테스트 결제창. 브라우저 부품 |
| 승인 | `src/components/payments/confirm.ts` | 토스 승인 API. `server-only` |
| 성공·실패·내역 | `src/app/payments/success`, `fail`, `history` | 승인 요청, 실패 기록, 내 결제 목록 |
| 승인 주소 | `src/app/api/payments/confirm/route.ts` | 로그인한 의뢰인의 승인 |
| 웹훅 | `src/app/api/payments/webhook/route.ts` | 세션 없이 같은 승인을 다시 반영 |
| 리뷰 | `src/app/reviews/new/[contractId]`, `src/app/reviews/actions.ts` | 작성, 이미 쓴 내용 표시 |
| 공개 리뷰 | `src/components/reviews/public-reviews.tsx` | 평균, 개수, 받은 리뷰. 1번 페이지에는 아직 안 끼움 |
| 표·함수 | `supabase/migrations/0500_payments.sql`, `0501_reviews.sql`, `0502_payment_sync.sql` | 결제, 리뷰, 웹훅용 동기화 |

SQL 순서는 `0500`, `0501`, `0502`입니다. `0500`은 `contracts`가 있어야 하므로 4번 `0401` 다음입니다. 파일 주석에는 `0400` 다음이라고 적혀 있으나, 계약 표는 `0401`에 있습니다.

## 2. 공통 진입

1. 결제·리뷰 화면은 로그인하지 않으면 "로그인한 뒤 다시 열어 주세요"를 보여 줍니다. 계약 화면처럼 로그인 주소로 보내지는 않습니다.
2. 계약 행이 RLS에 가려지면 "이 계약을 볼 수 없습니다"만 나옵니다. 금액은 나오지 않습니다.
3. 돈의 상태와 프로젝트 상태는 화면이 표를 직접 고치지 않습니다. 함수 하나가 같은 트랜잭션에서 바꿉니다.
4. 시크릿 키 `TOSS_SECRET_KEY`는 `test_`로 시작할 때만 승인 API에 씁니다. `live_` 키는 쓰지 않습니다.
5. 클라이언트 키는 서버가 `NEXT_TOSS_CLIENT_KEY`를 읽고, 그 값이 없으면 `NEXT_PUBLIC_TOSS_CLIENT_KEY`를 봅니다. 결제 버튼에만 넘깁니다. `test_`로 시작하지 않으면 결제창을 열지 않고 "라이브 키는 열지 않습니다"라고 알립니다.

## 3. 화면·서버 동작 입출력

### 3.1 결제 준비와 결제창

`/payments/[contractId]`는 계약 금액, 수수료 10%, 정산 금액을 보여 줍니다. 결제 줄이 있으면 그 줄의 세 수를 쓰고, 없으면 계약 금액으로 수수료를 나눠 보여 줍니다. 수수료 입력칸은 없습니다.

의뢰인에게 "결제 준비"가 나오는 조건은 결제 줄이 없고, 계약이 `signed`이고, 프로젝트가 `contract_pending`인 경우입니다. 누르면 `start_payment(p_contract_id)`가 `ready` 한 줄을 만듭니다.

`ready`이면 "테스트 결제하기"가 토스 결제창을 엽니다. 금액은 그 줄의 `amount`, 주문번호는 `order_id`, 성공 주소는 `/payments/success`, 실패 주소는 `/payments/fail`입니다. 결제 수단은 카드입니다.

### 3.2 승인

성공 화면은 주소의 `paymentKey`, `orderId`, `amount`를 `POST /api/payments/confirm`으로 보냅니다.

`confirmPaymentAsClient` 순서:

1. 로그인하지 않았으면 멈춥니다.
2. 그 주문번호를 당사자 조회로 찾습니다. 행이 없으면 멈춥니다.
3. 브라우저 금액이 `payments.amount`와 다르면 토스를 호출하지 않습니다.
4. 이미 `paid` 또는 `paid_out`이고 결제 키가 같으면 성공으로 끝냅니다.
5. `ready`가 아니면 멈춥니다.
6. 토스 `POST https://api.tosspayments.com/v1/payments/confirm`에 서버가 가진 금액을 보냅니다. 시크릿 키는 Basic 인증입니다.
7. 토스가 `ALREADY_PROCESSED_PAYMENT`를 주거나, 응답 금액이 우리 금액과 같으면 `mark_payment_paid(p_order_id, p_payment_key, p_amount)`를 호출합니다.
8. 저장이 실패해도 다시 읽었을 때 같은 키로 `paid` 또는 `paid_out`이면 성공으로 봅니다.

성공 화면은 저장이 끝나면 "결제가 보관되었습니다"를 보여주고 내역으로 가는 링크를 둡니다. 자동으로 내역 화면을 바꾸지는 않습니다.

### 3.3 웹훅

`POST /api/payments/webhook`은 로그인 세션이 없습니다. 본문의 `data.orderId`, `data.paymentKey`, `data.totalAmount`가 있어야 합니다. `status`가 있고 `DONE`이 아니면 상태를 바꾸지 않고 무시합니다.

그다음은 서비스 롤 키로 결제 줄을 읽고, 웹훅 금액이 우리 금액과 같은지 확인한 뒤 토스 승인 API를 다시 호출합니다. 웹훅 본문만으로 `paid`로 바꾸지 않습니다. 통과하면 `sync_payment_from_toss`를 호출합니다. 이 함수는 `authenticated`가 실행할 수 없고 `service_role`만 실행합니다.

이미 `paid` 또는 `paid_out`이고 키가 같으면 그대로 둡니다. 키가 다르면 `PAYMENT_KEY_CONFLICT`이고 상태를 덮지 않습니다.

### 3.4 실패

`/payments/fail`은 주문번호가 있고 아직 기록 전이면 "실패로 기록하고 다시 준비하기"를 보여 줍니다. `mark_payment_failed(p_order_id)`는 `ready`만 `failed`로 바꿉니다. `paid`는 실패로 바꾸지 않습니다. 화면은 함수 오류 문장을 보여 주지 않고 `saved=1` 안내로 이동합니다. 실패한 계약은 활성 결제 유일 조건에서 빠지므로 의뢰인이 결제를 다시 준비할 수 있습니다.

### 3.5 납품과 완료

버튼은 결제 화면에 있습니다.

| 버튼 | 조건 | 함수 |
| --- | --- | --- |
| 납품 요청 | 프리랜서, 결제 `paid`, 프로젝트 `in_progress` | `request_delivery(p_contract_id)` |
| 완료 승인 | 의뢰인, 결제 `paid`, 프로젝트 `delivered` | `approve_delivery(p_contract_id)` |

계약 상세 `/contracts/[id]`에는 이 버튼이 없습니다. 5번 확인 기록은 계약 상세에도 넣어 달라고 적어 두었으나, 현재 코드는 결제 화면에만 있습니다.

### 3.6 내역

`/payments/history`는 로그인한 사람에게 결제 줄을 보여 줍니다. RLS가 당사자 계약의 결제만 남깁니다. 주문번호, 금액 세 칸, 상태, 만든 시각이 나옵니다.

### 3.7 리뷰

`createReview({ contractId, rating, content, tags })`

화면은 별점, 내용, 태그를 받습니다. 태그는 `소통`, `일정`, `품질`, `전문성`, `재계약`만 남기고 5개까지 자릅니다. 상대방 id는 받지 않습니다.

완료 전이면 "완료 승인 뒤에 리뷰를 쓸 수 있습니다"만 나옵니다. 내가 이미 쓴 리뷰가 있으면 수정 칸 없이 그 내용과 "한 번 등록한 리뷰는 수정하지 않습니다"를 보여 줍니다.

공개 프로필 `src/app/users/[id]/page.tsx`는 `data-slot="public-reviews"`인 빈 자리만 있습니다. `PublicReviews`는 `src/components/reviews/public-reviews.tsx`에 있고, 평균과 개수, 작성자 이름, 별점, 내용, 태그, 날짜를 그립니다. 리뷰가 없으면 "아직 리뷰가 없습니다"입니다. 1번 페이지에 이 컴포넌트를 끼우는 일은 아직입니다.

## 4. 데이터 명세

### 4.1 `public.payments` — 0500

| 컬럼 | 타입 | 규칙 |
| --- | --- | --- |
| `id` | uuid | 기본키 |
| `contract_id` | uuid | `contracts.id` |
| `order_id` | text | `wb_`로 시작. 고유. 값은 `wb_`와 하이픈을 뺀 uuid |
| `payment_key` | text | 토스 결제 키. 준비 중에는 비어 있음 |
| `amount` | bigint | 계약 `agreed_amount`. 0보다 커야 함 |
| `fee_amount` | bigint | `(amount * 10) / 100`. 1원 미만은 버림 |
| `payout_amount` | bigint | `amount - fee_amount` |
| `status` | text | `ready`, `paid`, `paid_out`, `failed`, `refunded`. 기본 `ready` |
| `approved_at` | timestamptz | `paid`와 `paid_out`에는 필요 |
| `paid_out_at` | timestamptz | `paid_out`에는 필요 |
| `created_at`, `updated_at`, `deleted_at` | timestamptz | 수정 시각은 트리거가 갱신 |

지워지지 않았고 상태가 `ready`, `paid`, `paid_out`인 결제는 계약당 하나입니다. `failed`는 이 조건 밖이라 다시 준비할 수 있습니다.

조회 정책 `payments_select_parties`는 로그인 사용자에게, 삭제되지 않았고 `payment_contract_party`가 참인 행만 보여 줍니다. 그 함수는 계약의 의뢰인 또는 프리랜서인지 확인합니다. 브라우저의 insert·update는 없습니다.

예: 100,000원이면 수수료 10,000원, 정산 90,000원. 100,001원이면 수수료 10,000원, 정산 90,001원입니다. 부가세는 더하지 않습니다.

### 4.2 `public.reviews` — 0501

| 컬럼 | 타입 | 규칙 |
| --- | --- | --- |
| `id` | uuid | 기본키 |
| `contract_id` | uuid | `contracts.id` |
| `reviewer_id`, `reviewee_id` | uuid | 서로 달라야 함 |
| `rating` | integer | 1~5 |
| `content` | text | 앞뒤 공백을 뺀 뒤 1~1,000자 |
| `tags` | text[] | 위 다섯 단어만. 최대 5개. 없어도 됨 |
| `created_at`, `deleted_at` | timestamptz | 소프트 삭제 |

`UNIQUE(contract_id, reviewer_id)`라 한 계약에 한 사람당 한 줄입니다. 수정 함수는 없습니다.

조회는 anon과 authenticated 모두, 삭제되지 않은 리뷰를 볼 수 있습니다. insert는 함수만 합니다.

`review_summaries`는 `reviewee_id`별 평균을 소수 둘째 자리로 반올림한 값과 개수입니다. `security_invoker`라 리뷰 조회 권한을 그대로 탑니다. anon과 authenticated가 SELECT할 수 있습니다.

## 5. RPC

| 함수 | 입력 | 반환 | 실행 허용 |
| --- | --- | --- | --- |
| `start_payment` | 계약 uuid | 결제 uuid | authenticated, service_role |
| `mark_payment_paid` | 주문번호, 결제 키, 금액 | 결제 uuid | authenticated, service_role |
| `mark_payment_failed` | 주문번호 | 결제 uuid | authenticated, service_role |
| `request_delivery` | 계약 uuid | 계약 uuid | authenticated, service_role |
| `approve_delivery` | 계약 uuid | 계약 uuid | authenticated, service_role |
| `create_review` | 계약 uuid, 별점, 내용, 태그 | 리뷰 uuid | authenticated, service_role |
| `sync_payment_from_toss` | 주문번호, 결제 키, 금액 | 결제 uuid | service_role만 |

### 5.1 시작

의뢰인만 호출합니다. 계약이 있고 `signed`이며, 프로젝트가 `contract_pending`이고, 활성 결제가 없고, 금액이 0보다 클 때 `ready`를 만듭니다. 주문번호는 서버가 만듭니다.

### 5.2 결제 완료

의뢰인만 `mark_payment_paid`를 호출합니다. 결제 줄을 잠그고, 상태가 `ready`이며 금액이 같을 때만 `paid`와 `approved_at`, `payment_key`를 기록합니다. 프로젝트를 `contract_pending`에서 `in_progress`로 바꿉니다. 프로젝트가 그 상태가 아니면 `PROJECT_STATUS_CONFLICT`로 함께 되돌아갑니다. 프리랜서에게 `payment_completed`를 보냅니다.

`sync_payment_from_toss`는 같은 금액·상태 변경과 같은 알림을 세션 없이 합니다. 이미 같은 키로 끝난 결제는 id만 반환합니다.

### 5.3 납품·완료

`request_delivery`는 프리랜서만, 결제가 `paid`이고 프로젝트가 `in_progress`일 때 프로젝트를 `delivered`로 바꿉니다. 돈은 `paid`입니다. 의뢰인에게 `delivery_requested`를 보냅니다.

`approve_delivery`는 의뢰인만, 결제가 `paid`이고 프로젝트가 `delivered`일 때 프로젝트를 `completed`로, 결제를 `paid_out`으로 바꾸고 `paid_out_at`을 찍습니다. 프리랜서에게 `delivery_approved`, 양쪽에게 `review_requested`를 보냅니다.

### 5.4 리뷰

별점 1~5, 내용 길이, 태그 목록을 검사합니다. 계약 당사자만 쓸 수 있습니다. 의뢰인이 쓰면 받는 사람은 프리랜서이고, 프리랜서가 쓰면 받는 사람은 의뢰인입니다. 프로젝트가 `completed`가 아니면 `PROJECT_NOT_COMPLETED`입니다. 같은 사람이 다시 쓰면 `REVIEW_ALREADY_EXISTS`입니다.

## 6. 알림

화면은 `createNotification()`을 따로 부르지 않습니다. 함수 안에서 `public.create_notification`을 호출합니다.

| type | 수신자 | link | event_key |
| --- | --- | --- | --- |
| `payment_completed` | 프리랜서 | `/payments/history` | `payment_completed:<결제 id>` |
| `delivery_requested` | 의뢰인 | `/payments/<계약 id>` | `delivery_requested:<계약 id>` |
| `delivery_approved` | 프리랜서 | `/payments/history` | `delivery_approved:<결제 id>` |
| `review_requested` | 의뢰인, 프리랜서 각각 | `/reviews/new/<계약 id>` | `review_requested:<수신자 id>:<계약 id>` |

## 7. 권한·오류

| 코드 | 화면 문장 또는 의미 |
| --- | --- |
| `CONTRACT_NOT_SIGNED` | 서명이 끝난 계약만 결제할 수 있습니다. |
| `PROJECT_NOT_READY_FOR_PAYMENT` | 프로젝트가 계약 대기 상태가 아닙니다. |
| `PAYMENT_ALREADY_EXISTS` | 이미 진행 중인 결제가 있습니다. |
| `CLIENT_REQUIRED` | 의뢰인만 할 수 있습니다. |
| `FREELANCER_REQUIRED` | 프리랜서만 납품을 요청할 수 있습니다. |
| `ESCROW_REQUIRED` | 보관 중인 결제만 정산할 수 있습니다. |
| `PROJECT_NOT_IN_PROGRESS` | 작업 중인 프로젝트만 납품 요청할 수 있습니다. |
| `PROJECT_NOT_DELIVERED` | 납품 요청 상태에서만 완료 승인할 수 있습니다. |
| `PAYMENT_NOT_READY` | `ready`가 아닌 결제는 완료나 실패로 덮지 않음 |
| `AMOUNT_MISMATCH` | 승인 금액이 저장된 금액과 다름 |
| `PAYMENT_KEY_CONFLICT` | 끝난 주문에 다른 결제 키가 오면 유지 |
| `PROJECT_NOT_COMPLETED` | 완료된 프로젝트에서만 리뷰를 쓸 수 있습니다. |
| `REVIEW_ALREADY_EXISTS` | 이미 작성한 리뷰는 수정할 수 없습니다. |
| `INVALID_RATING`, `INVALID_CONTENT`, `INVALID_TAGS` | 리뷰 입력이 규칙을 벗어남 |

비로그인과 계약 밖 회원은 결제 줄을 보지 못합니다. 리뷰 목록과 평균은 볼 수 있습니다. 환불 화면과 `refunded`로 바꾸는 함수는 없습니다. 상태 값만 표에 허용되어 있습니다.

## 8. 팀 연결

- 4번 계약이 `signed`가 된 뒤에만 `start_payment`가 됩니다. 프로젝트는 그때까지 `contract_pending`이어야 합니다.
- 결제 완료가 `in_progress`, 납품 요청이 `delivered`, 완료 승인이 `completed`입니다. 이 상태 변경은 5번 함수가 합니다.
- 1번 공개 프로필의 빈 `data-slot="public-reviews"`에 `PublicReviews`를 넣어 달라는 요청이 `docs/sprints/2026-11-25-5-payment-check.md`에 있습니다. 1번 파일은 이 문서 작업에서 고치지 않았습니다.
- 알림 함수는 3번 `0301`의 `create_notification`입니다. `0500`을 실행하기 전에 그 함수가 있어야 합니다.

## 9. 확인과 한계

`docs/sprints/2026-11-25-5-payment-check.md`는 다음을 코드 기준으로 적어 두었습니다.

- 토스에 보내는 금액은 브라우저 값이 아니라 `payments.amount`입니다.
- 시크릿 키는 `test_`로 시작할 때만 씁니다.
- 같은 웹훅이 다시 와도 `paid`와 `paid_out`을 되돌리지 않고, 다른 결제 키로 덮지 않습니다.
- 로컬 `npm run build`는 그 기록에서 성공했습니다.

시연용 계약 씨앗은 `supabase/seeds/0502_demo_contract.sql`입니다. 그 기록은 4번 `0400`이 생기기 전에만 실행한다고 적혀 있고, 계약 번호는 `55555555-5555-4555-8555-555555555555`입니다. 키를 넣은 뒤 시연 의뢰인의 결제 준비, 테스트 카드, 프리랜서 납품 요청, 의뢰인 완료 승인, 양쪽 리뷰 한 번씩이 확인 순서입니다. 이 문서 작업에서 그 결제를 다시 실행하지는 않았습니다.

## 10. 이번 주에 만들지 않는 것

라이브 키 결제, 환불 화면, 세금계산서, 원천징수, 부분 정산, 중도금, 분쟁 조정, 리뷰 수정, 리뷰 삭제.

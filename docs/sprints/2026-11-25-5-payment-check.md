# 5번 결제·정산·리뷰 확인 (2026-11-25)

Vercel 프로덕션에는 `NEXT_TOSS_CLIENT_KEY` 와 `TOSS_SECRET_KEY` 가 등록되어 있습니다. 값은 문서에 적지 않습니다. 이 변수는 배포가 다시 만들어질 때 서버에 들어갑니다. 미리보기 배포에는 대상이 프로덕션뿐이라 포함되지 않습니다.

코드로 막아 둔 것:

- 승인 금액은 브라우저 값이 아니라 `payments.amount` 를 토스에 보냅니다. 브라우저 금액이 다르면 승인 호출 전에 멈춥니다.
- 시크릿 키는 `test_` 로 시작할 때만 사용합니다.
- 웹훅이 같은 주문을 다시 보내면 이미 `paid` 또는 `paid_out` 인 상태를 유지합니다. 다른 결제 키면 덮어쓰지 않습니다.

시연 계약은 `supabase/seeds/0502_demo_contract.sql` 입니다. 4번 `0400` 이 생기기 전에만 실행합니다. 계약 번호는 `55555555-5555-4555-8555-555555555555` 이고 주소는 `/payments/55555555-5555-4555-8555-555555555555` 입니다.

1번에게: 공개 프로필의 `data-slot="public-reviews"` 안에 `PublicReviews` 를 넣어 주세요. 파일은 `src/components/reviews/public-reviews.tsx` 입니다. 1번 페이지는 고치지 않았습니다.

4번에게: 계약 상세에 `DeliveryActions` 를 넣어 주세요. 파일은 `src/components/payments/delivery-actions.tsx` 입니다. 납품 요청과 완료 승인 버튼이 들어 있습니다.

로컬에서 `npm run build` 는 성공했습니다. 화면 주소는 `/payments/[contractId]`, `/payments/success`, `/payments/fail`, `/payments/history`, `/reviews/new/[contractId]` 입니다. 키를 넣은 뒤에 시연 계정으로 결제 준비, 테스트 카드 승인, 납품 요청, 완료 승인, 리뷰 한 번 작성까지 순서대로 확인하면 됩니다.

확인 순서는 키를 채운 뒤 시연 의뢰인으로 결제 준비, 테스트 카드, 프리랜서 납품 요청, 의뢰인 완료 승인, 양쪽 리뷰 한 번씩이다.

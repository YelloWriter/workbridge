# 화·수 지원·알림 구현 검증

작업일: 2026-11-24 (화), 한국 시간. 브랜치: `feat/3-applications-notifications`.
최신 origin/main `392c552`를 반영한 상태에서 작업했다.

## 구현 상태

| 요구 | 결과 |
| --- | --- |
| 자기소개/예상 금액/예상 기간, 중복 지원 차단 | 구현. 폼·서버·SQL에서 검사하며 실패 시 입력 유지 |
| 미완성 프로필 이동 및 지원 후 내 지원 현황 이동 | 구현. 프로필로 보낼 때 원래 지원 주소 보존 |
| 본인 프로젝트 지원서 목록·열람·수락·거절 | 구현. 이름 표시, 30개 단위 목록, 서버와 RPC 권한 재검사 |
| 수락 금액과 4번 인계 | 수락 금액을 applications.accepted_agreed_amount에 저장. 실제 계약 생성은 4번 연결 필요 |
| 내 지원 현황과 거절 이유 보존 | 구현. pending/accepted/rejected 및 manual/auto/closed/negotiation_failed 표시 |
| 서버 전용 createNotification | 기존 구현 유지. 4·5번 단독 서버 알림에서 import 가능 |
| 필수 알림 5종 | SQL 업무 RPC 안에서 생성. 같은 사건 재시도 중복 방지 |
| 헤더용 종 | 초기 안 읽은 수 조회, 읽음 후 개수 갱신 보완. 헤더 삽입은 1번 담당 |
| 알림 선택 시 읽음·관련 화면 이동 / 모두 읽음 | 구현 및 로컬 브라우저 검증 |

## 자동 DB 검사

`src/components/applications/tests/database.mjs`: **70개 검사 통과**.

최종 `npm run lint` 통과 (0 오류). `npm run build`도 키 미설정 상태와 로컬 API 대역 설정 상태에서 모두 통과했다. 테스트용 빌드 설정이 남지 않도록 마지막 빌드는 환경 변수를 지정하지 않고 실행했다.

이전의 축소 profiles/projects fixture를 실제 `0100_profiles.sql`, `0200_projects.sql`, `0201_bookmarks.sql`, `0300_applications.sql`, `0301_notifications.sql`, `0302_application_access.sql`로 교체했다. Supabase auth/storage 기반 객체와 기본 grant만 임시로 구성하고, 각 SQL의 트리거·컬럼 권한·RLS·RPC는 그대로 실행했다.

확인한 것: 본인/의뢰인만 지원서 조회, 본인 알림만 읽음 변경, 중복 지원/직접 상태 변경 차단, 수락+자동 거절+프로젝트 상태+양쪽 알림, 직접 거절과 마감 사유 보존, 5종 알림, 재시도 중복 방지, 알림 실패 시 업무 전체 롤백, 자동 마감 시각 검사. 추가로 null 역할 및 탈퇴 계정의 지원/조회/선정 차단과 실제 프로필 컬럼 권한을 검사했다.

재현 (저장소 루트에서):

1. 별도 임시 폴더에 `@electric-sql/pglite`를 설치한다. 앱 package.json에 추가할 필요는 없다.
2. `WORKBRIDGE_PGLITE_MODULE`에 그 폴더 안의 `node_modules/@electric-sql/pglite/dist/index.js` 절대 경로를 지정한다.
3. `node src/components/applications/tests/database.mjs`를 실행한다.

## 브라우저 검증 — 임시 DB / API 대역

실제 Next.js 프로덕션 빌드·Server Action을 로컬 임시 DB에 연결했다. 대역 API는 PostgreSQL의 실제 RLS와 RPC를 사용자 역할로 실행한다. Supabase Auth와 PostgREST HTTP 형식 일부만 로컬 대역이며 실제 팀 서비스와 통신하지 않았다.

| 검증 | 관찰 결과 |
| --- | --- |
| A 지원서 작성·제출 | `/me/applications` 이동, 검토중, 제안 금액 2,500,000원·30일 |
| A가 같은 지원 페이지 재방문 | 이미 지원 안내. 폼 중복 표시 없음 |
| B가 별도 지원 | 의뢰인 목록 2건, 각 프리랜서 이름 표시 |
| 의뢰인이 A의 지원서 펼침 | 제출한 소개·제안 내용 표시 |
| 협의 금액 2,600,000원으로 A 수락 | A 수락, B 자동 거절, 입력 금액 보존 |
| 의뢰인 알림 | 신규 지원 2건+선정 확인 1건으로 안 읽음 3개 |
| 신규 지원 알림 선택 | 지원자 관리로 이동, 안 읽음 3→2 |
| 모두 읽음 | 의뢰인의 안 읽음 2→0 |
| B 내 지원 현황·알림 | 거절 이유가 계속 남음. 의뢰인의 모두 읽음 이후에도 B 알림은 안 읽음 1개 유지 |
| B 자동 거절 알림 선택 | 본인 내 지원 현황으로 이동 |
| A 수락 알림 선택 | 본인 내 지원 현황 이동, 협의 시작 금액 2,600,000원 표시 |
| 다른 의뢰인의 지원자 관리 접근 | 404, 지원서 내용 미노출 |
| 미완성 프로필의 지원 진입 | `/me/profile?next=%2Fprojects%2F...%2Fapply`로 이동 확인. **프로필 화면은 1번 코드가 없어 404이며 저장 후 복귀는 미검증** |

로컬 재현용 파일: `src/components/applications/tests/browser-fixture.mjs`.

1. 위 PGlite 모듈 경로를 지정한 환경에서 `node src/components/applications/tests/browser-fixture.mjs` 실행 (127.0.0.1:3014).
2. 별도 터미널에서 `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3014 NEXT_PUBLIC_SUPABASE_ANON_KEY=local-fixture-anon npm run build` 실행.
3. 같은 환경 변수로 `npm run start -- --hostname 127.0.0.1 --port 3003` 실행.
4. 브라우저에서 `http://127.0.0.1:3014/test`를 열고 임시 계정을 선택한다. 테스트 서버를 다시 시작하면 데이터가 초기화된다.

대역 JWT·계정 전환 코드는 로컬 검증 전용으로 app route에 추가하지 않았다. 이 환경 변수는 `.env.local`에 저장하지 않았다. 개발 서버는 로컬 파일 감시기(FSEvent) 오류로 중단돼 프로덕션 빌드 서버로 검증했다.

종료 시 서버 로그에서 Supabase Auth 내부의 현재 시각 조회가 Next.js 사전 렌더링 검사에 잡히는 경고를 확인했다. 담당 서버 진입부와 종 컴포넌트에서 `connection()`을 먼저 기다리도록 보완해 인증 초기화를 요청 시점으로 제한했다. 이는 1번의 Supabase 공통 파일을 수정하지 않는 방식이다.
보완 후 설정된 상태로 다시 빌드하고, 인증한 HTTP 요청으로 담당 페이지 4개와 실제 지원 제출/수락 Server Action 2개를 다시 실행했다. 제출의 303 이동과 수락 금액 저장을 확인했으며 서버 로그에 해당 경고·오류가 없었다.

## 실제 팀 환경에서 남은 것

- 공용 Supabase 키를 받아 실제 환경에서 연결. 현재 `.env.local`과 관련 프로세스 환경 변수 없음.
- 이미 적용한 SQL을 확인한 후 미적용 0300/0301/0302만 순서대로 실행. **이번 작업에서 실 DB에 적용하지 않았다.**
- 1번 인증·프로필 화면에서 저장 후 지원 복귀, 헤더에 NotificationBell 삽입 후 실제 숫자 갱신 확인.
- 2번 프로젝트 화면과 모집 마감 `close_project_applications` 호출 연결.
- 4번 계약 생성과 합의 금액 인계 연결.
- 실제 Supabase 계정 3개와 독립 DB 연결의 동시 수락/마감, 실제 PostgREST/Realtime 검증.

실제 공용 환경 통합을 완료했다고 표시하지 않는다. 이전의 11월 23일 검증 기록은 당시의 결과로 유지한다.

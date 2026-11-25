# 1번 기능 명세서: 기반·로그인·프로필·배포·브랜치 합치기

이 문서는 1번이 사용자와 팀에게 보여주는 기능 범위입니다. 파일 이름, 함수 입력, 배포 순서 같은 구현 세부는 `docs/specs/1-auth-profile-detail.md` 에 있습니다.

화면 흐름의 참고는 `docs/rea/1-auth-profile.md`. 팀이 정한 이유는 `docs/decisions/2026-11-23-profiles.md`, `docs/decisions/2026-11-23-social-login.md`. 데이터베이스는 `supabase/migrations/0100_profiles.sql`. 배포 주소와 시연 계정은 `docs/setup.md`.

## 쓰는 사람

- 아직 가입하지 않은 사람
- 의뢰인 (`role = client`)
- 프리랜서 (`role = freelancer`)
- 로그인했지만 역할을 아직 고르지 않은 사람 (`role` 이 비어 있음)

## 화면

| 주소 | 누가 보나 | 하는 일 |
| --- | --- | --- |
| `/signup` | 로그인 전 | 이메일·비밀번호 가입, 구글 가입 |
| `/login` | 로그인 전 | 이메일·비밀번호 로그인, 구글 로그인 |
| `/auth/callback` | 구글이 돌려보내는 주소 | 세션을 저장하고 다음 화면으로 이동. 사람이 머무는 화면은 아님 |
| `/onboarding/role` | 로그인했고 역할이 비어 있을 때 | 의뢰인 또는 프리랜서 선택 |
| `/me/profile` | 로그인 본인 | 내 정보 수정, 이미지 업로드 |
| `/users/[id]` | 누구나 | 공개 프로필. 이메일은 안 보임 |

`/login`, `/signup`, `/onboarding/role`, `/me/profile` 은 주소 뒤에 `?next=/가려던경로` 를 받을 수 있습니다. `next` 는 `/` 로 시작하는 우리 경로만 인정합니다. `https://` 나 `//` 로 시작하면 버리고 메인(`/`)으로 갑니다.

이미 로그인한 사람이 `/login` 이나 `/signup` 에 오면, 역할이 없으면 `/onboarding/role`, 있으면 `next` 또는 메인으로 보냅니다.

## 가입하고 나서의 순서

1. 가입 또는 로그인에 성공한다.
2. `profiles.role` 이 비어 있으면 `/onboarding/role` 로 간다. `next` 가 있었으면 그 값을 그대로 들고 간다.
3. 역할을 저장하면 `next` 가 있으면 그 주소로, 없으면 메인으로 간다.
4. 2번(프로젝트 등록)과 3번(지원)은 이름이 비어 있으면 `/me/profile?next=원래주소` 로 보낸다. 1번이 그 주소를 받아서, 저장 후 `next` 로 돌려보낸다.

"이름이 비어 있음"은 `name` 이 null 이거나 공백만 있는 경우입니다. 회사명이나 기술은 비어 있어도 이름이 있으면 통과입니다.

## 공통 헤더

파일은 `src/components/layout` 입니다. 1번만 수정합니다. 메뉴를 더 넣고 싶으면 1번에게 요청합니다.

로그인 전:

- 로고 → `/`
- 회원가입 → `/signup`
- 로그인 → `/login`

로그인 후, 역할을 고르기 전:

- 내 프로필 → `/me/profile`
- 로그아웃
- 역할별 메뉴는 아직 숨김

로그인 후, 의뢰인:

- 내 프로필 → `/me/profile`
- 내 프로젝트 → `/me/projects` (화면은 2번)
- 로그아웃

로그인 후, 프리랜서:

- 내 프로필 → `/me/profile`
- 내 지원 현황 → `/me/applications` (화면은 3번)
- 북마크 → `/me/bookmarks` (화면은 2번)
- 로그아웃

알림 아이콘 자리는 로그인 후에만 헤더에 비워 둡니다. 3번이 `src/components/notifications` 컴포넌트를 끼웁니다. 1번은 아래 자리만 만듭니다.

```tsx
{/* 3번 담당: 알림 아이콘 컴포넌트를 이 자리에 넣어 주세요. */}
<div data-slot="header-notifications" />
```

## 회원가입 `/signup`

입력:

| 칸 | 규칙 |
| --- | --- |
| 이메일 | 필수, 이메일 형식 |
| 비밀번호 | 필수, 8자 이상 |
| 비밀번호 확인 | 비밀번호와 같아야 함 |

버튼: 회원가입, 구글로 계속하기. 아래에는 로그인으로 가는 링크.

출력:

- 성공: 세션이 생기고 위의 "가입하고 나서의 순서"로 이동
- 이미 있는 이메일: "이미 가입된 이메일입니다. 로그인해 주세요." 구글로 먼저 만든 계정이면 "구글로 로그인해 주세요."
- 그 외 실패: Supabase 가 준 이유를 짧은 문장으로 보여 줌

별도 아이디, 약관 체크, 페이스북, 비밀번호 찾기는 만들지 않습니다.

## 로그인 `/login`

입력: 이메일, 비밀번호. 버튼: 로그인, 구글로 계속하기. 회원가입으로 가는 링크.

출력:

- 성공: 위의 순서대로 이동
- 실패: "이메일 또는 비밀번호가 맞지 않습니다." 둘 중 무엇인지는 구분하지 않습니다.

세션은 쿠키에 남습니다. `src/proxy.ts` 가 요청마다 갱신합니다. 로그아웃하기 전까지 유지됩니다. "로그인 상태 유지" 체크는 없습니다.

## 구글 로그인

서버 동작 `signInWithGoogle`:

- 입력: 현재의 `next` (있으면)
- 동작: Supabase Auth 구글로 이동. 돌아오는 주소는 `{NEXT_PUBLIC_SITE_URL}/auth/callback`
- `/auth/callback` 이 코드를 세션으로 바꾸고, 역할이 없으면 역할 화면으로, 있으면 `next` 또는 메인으로 이동

같은 이메일이면 계정을 새로 만들지 않습니다. `docs/decisions/2026-11-23-social-login.md`.

## 역할 선택 `/onboarding/role`

입력: `client` 또는 `freelancer` 중 하나. 화면 글자는 "의뢰인", "프리랜서" (`src/lib/constants.ts` 의 `ROLES`).

서버 동작 `completeRole`:

- 로그인하지 않았으면 `/login?next=/onboarding/role` 로 이동
- `profiles` 의 본인 행 `role` 만 갱신
- 성공하면 `next` 또는 `/` 로 이동
- 실패하면 화면에 이유 표시

이미 역할이 있는 사람이 이 주소로 오면 `next` 또는 메인으로 바로 보냅니다. 역할 변경은 내 프로필에서 합니다.

## 내 프로필 `/me/profile`

로그인 필요. 아니면 `/login?next=/me/profile` (뒤에 원래 `next` 가 있으면 유지).

위에 이메일을 읽기 전용으로 보여 줍니다. 출처는 `profiles` 가 아니라 `auth.getUser()` 입니다.

공통 입력:

| 칸 | 규칙 |
| --- | --- |
| 이름 | 필수, 앞뒤 공백 제거, 1~40자 |
| 프로필 이미지 | 선택. jpg, png, webp. 5MB 이하 |
| 소개 | 선택, 1000자 이하 |

의뢰인만:

| 칸 | 규칙 |
| --- | --- |
| 회사 이름 | 선택 |
| 업종 | 선택 |
| 웹사이트 | 선택, 300자 이하. `http://` 또는 `https://` 로 시작 |

프리랜서만:

| 칸 | 규칙 |
| --- | --- |
| 분야 | 선택. `CATEGORIES` 중 하나 |
| 기술 | 선택. `SKILLS` 에서 여러 개, 최대 20 |
| 경력 연수 | 선택, 0 이상 정수 |
| 시간당 금액 | 선택, 0 이상 정수, 원 |
| 포트폴리오 링크 | 선택, 300자 이하. `http://` 또는 `https://` 로 시작 |

역할 변경 라디오도 둡니다. 바꾸면 아래 칸이 그 역할 것으로 바뀝니다. 숨긴 칸의 기존 값은 지우지 않고 데이터베이스에 둡니다.

서버 동작 `updateProfile`:

- 입력: 위 칸. 이미지 파일은 이 동작에 넣지 않고, 브라우저가 Storage 에 직접 올린 뒤 `avatar_url` 만 넘깁니다.
- 본인 행만 update
- 성공: `next` 가 안전하면 그 주소로 이동. 없으면 이 화면에 남고 "저장했습니다" 를 보여 줌
- 실패: 칸 아래에 이유

이미지 업로드:

- 버킷 `avatars`, 경로 `{내 user id}/avatar` (확장자는 파일에 맞게)
- 같은 경로에 다시 올려 덮어씀
- 공개 주소가 나오면 `avatar_url` 에 저장
- 다른 사람 폴더에는 정책이 거절함

## 공개 프로필 `/users/[id]`

로그인 없이 봅니다. `id` 는 `profiles.id` (auth 사용자 id 와 같음).

조회 칸: `id, role, name, avatar_url, bio, company_name, business_field, website, category, skills, career_years, hourly_rate, portfolio_url`. `select *` 는 쓰지 않습니다. 이메일에 권한이 없어서 조회가 실패합니다.

없는 id 이거나 역할이 아직 없으면 "프로필을 찾을 수 없습니다" 를 보여 줍니다. `deleted_at` 이 있는 행은 RLS 가 이미 숨깁니다.

보여주는 것:

- 이미지, 이름, 역할 한글 라벨, 소개
- 의뢰인: 회사 이름, 업종, 웹사이트
- 프리랜서: 분야, 기술, 경력, 시간당 금액, 포트폴리오 링크
- 값이 없는 칸은 행 자체를 숨김

리뷰 자리:

```tsx
{/* 5번 담당: 평균 별점과 리뷰 목록 컴포넌트를 이 자리에 넣어 주세요. userId 를 넘기면 됩니다. */}
<div data-slot="public-reviews" data-user-id={id} />
```

1번은 이 자리에 별점이나 리뷰 데이터를 만들지 않습니다.

## 서버 동작 요약

모두 서버에서만 실행합니다. 브라우저에 `service_role` 키를 넣지 않습니다.

| 동작 | 입력 | 성공 출력 | 권한 |
| --- | --- | --- | --- |
| `signUp` | 이메일, 비밀번호, `next` | 세션 후 역할 화면 또는 `next` | 누구나 |
| `signIn` | 이메일, 비밀번호, `next` | 같음 | 누구나 |
| `signInWithGoogle` | `next` | 구글로 이동 | 누구나 |
| `signOut` | 없음 | 세션 삭제 후 `/` | 로그인 사용자 |
| `completeRole` | `client` 또는 `freelancer`, `next` | 본인 `role` 저장 후 이동 | 본인 |
| `updateProfile` | 프로필 칸, `next` | 본인 행 수정 후 이동 또는 저장 메시지 | 본인 |

실패하면 `{ ok: false, message: string }` 를 돌려 화면에 적습니다. 성공해서 다른 주소로 갈 때는 값을 돌려주지 않고 이동합니다.

## 권한

| 행동 | 비로그인 | 다른 회원 | 본인 |
| --- | --- | --- | --- |
| 가입, 로그인 | 가능 | 해당 없음 | 이미 로그인 상태면 역할/메인으로 보냄 |
| 공개 프로필 보기 | 가능 (이메일 제외) | 가능 | 가능 |
| 역할 저장, 프로필 수정 | 불가 | 불가 | 가능 |
| 이미지 업로드 | 불가 | 자기 폴더 불가 | 자기 폴더만 |
| 프로필 행 직접 insert | 불가 | 불가 | 불가. 가입 트리거만 가능 |
| 행 삭제 | 불가 | 불가 | 불가. 이번 주에는 탈퇴 없음 |

2번·3번이 프로필을 읽을 때:

```ts
supabase
  .from("profiles")
  .select("id, role, name, avatar_url, bio, company_name, business_field, website, category, skills, career_years, hourly_rate, portfolio_url")
  .eq("id", userId)
  .maybeSingle();
```

`email`, `deleted_at` 은 이 목록에 넣지 않습니다.

## 같이 쓰는 목록

`src/lib/constants.ts`

- `ROLES`: `client` 의뢰인, `freelancer` 프리랜서
- `CATEGORIES`: 웹 개발, 앱 개발, 디자인, 기획, 데이터·AI
- `SKILLS`: JavaScript, TypeScript, React, Next.js, Vue, HTML/CSS, Node.js, Python, Java, Kotlin, Swift, PHP, SQL, Figma

## 이번 주에 일부러 안 하는 것

- 비밀번호 찾기, 이메일 변경, 회원 탈퇴
- 페이스북·카카오 로그인
- 약관 동의 화면
- 별점, 리뷰, 알림의 실제 내용 (자리만 비움)
- 홈과 프로젝트 화면 (2번)

## 배포

1번이 Vercel 프로젝트와 공용 Supabase를 유지합니다. `main`에 합쳐지면 사이트가 자동으로 다시 배포됩니다. 주소와 로그인 뒤에 돌아올 주소는 `docs/setup.md`에 있습니다.

비밀 키는 GitHub와 이 문서에 올리지 않습니다. 브라우저에 보여도 되는 값만 `NEXT_PUBLIC_` 로 시작합니다. 서비스 롤 키와 결제 시크릿 키는 서버 전용입니다. 토스 클라이언트 키는 공개 접두사 없이 `NEXT_TOSS_CLIENT_KEY` 로 두고, 5번 화면이 서버에서 읽어 결제창에만 넘깁니다.

## 매일 브랜치 합치기

1번이 매일 저녁, 각 담당 브랜치를 `main`으로 합칩니다.

1. 원격 브랜치를 가져옵니다.
2. `main`에 없는 커밋이 있는 브랜치만 고릅니다.
3. 서로 같은 파일을 고쳤는지 확인합니다. 겹치면 그 담당에게 알리고, 겹치지 않으면 합칩니다.
4. `npm run build` 가 성공한 뒤에만 `main`에 올립니다.
5. 합친 내용과, 공용 데이터베이스에 아직 실행하지 않은 SQL이 있으면 팀에게 번호 순서를 알려 줍니다.

남의 담당 폴더에 있는 파일은 합치기 충돌을 풀 때를 빼고 1번이 고쳐 쓰지 않습니다.

## 목·금에 확인할 것

- 계정 둘로 RLS 확인: 다른 사람 프로필은 수정되지 않고, 이메일은 브라우저 조회로 안 읽히는지. 결과를 docs 에 적음
- Vercel 배포와 Supabase Site URL. 값은 `docs/setup.md` 에 이어서 적음
- 시연용 의뢰인·프리랜서 계정
- README 의 "DB 재현 방법"

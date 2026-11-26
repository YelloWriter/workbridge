# 1번 세부 명세서: 기반·로그인·프로필·배포·브랜치 합치기

기능 범위는 `docs/specs/1-auth-profile.md` 입니다. 이 문서는 그 기능을 코드와 운영 절차로 나눈 것입니다. 화면 문구와 상태값 이름은 `docs/TEAM.md` 를 그대로 씁니다.

## 1. 담당 폴더

| 경로 | 하는 일 |
| --- | --- |
| `src/app/(auth)/**` | 로그인, 회원가입, 서버 동작 |
| `src/app/auth/**` | 구글이 돌아온 뒤 세션을 저장하는 주소 |
| `src/app/onboarding/**` | 역할 선택 |
| `src/app/me/profile/**` | 내 프로필 수정 |
| `src/app/users/**` | 공개 프로필 |
| `src/components/layout/**` | 공통 헤더. 다른 번호는 수정하지 않고 1번에게 요청 |
| `src/lib/supabase/**` | 서버·브라우저 Supabase 연결과 세션 갱신 |
| `src/proxy.ts` | 요청마다 세션 쿠키를 갱신 |
| `src/lib/constants.ts` | 역할, 분야, 기술 목록. 2번·3번과 같이 씀 |
| `supabase/migrations/0100`~`0199` | 프로필 표와 사진 저장 정책 |
| `docs/setup.md` | 배포 주소, 시연 계정, 데이터베이스 준비 순서 |

`src/components/ui/**` 는 새 부품 추가만 가능하고 기존 파일은 고치지 않습니다.

## 2. 데이터베이스

표 이름은 `profiles` 입니다. 한 사람당 한 행이고, `id` 는 `auth.users.id` 와 같습니다. 가입하면 트리거가 행을 만듭니다. 화면에서 직접 insert 하지 않습니다.

역할은 `client` 또는 `freelancer` 이거나, 아직 고르기 전이면 비어 있습니다. 이름 제약은 앞뒤 공백을 뺀 1~40자입니다. 삭제는 `deleted_at` 만 쓰고, 이번 주에는 탈퇴 화면이 없습니다.

브라우저에 허용하는 조회 칸은 `id, role, name, avatar_url, bio, company_name, business_field, website, category, skills, career_years, hourly_rate, portfolio_url` 입니다. `email` 과 `deleted_at` 은 이 목록에 넣지 않습니다. `select *` 는 이메일 권한이 없어 실패합니다.

사진 버킷 이름은 `avatars` 입니다. 경로는 `{사용자 id}/avatar` 이고, 본인 폴더만 올리고 누구나 읽을 수 있습니다.

## 3. 서버 동작

모두 서버에서 실행합니다. `service_role` 키는 브라우저 코드와 `NEXT_PUBLIC_` 에 넣지 않습니다.

| 동작 | 파일 | 입력 | 성공 | 실패 때 화면 |
| --- | --- | --- | --- | --- |
| `signUp` | `src/app/(auth)/actions.ts` | 이메일, 비밀번호, `next` | 세션 후 역할이 없으면 역할 화면, 있으면 `next` 또는 `/` | 이미 있으면 로그인 안내 |
| `signIn` | 같은 파일 | 이메일, 비밀번호, `next` | 위와 같음 | 이메일과 비밀번호 중 무엇이 틀렸는지 구분하지 않음 |
| `signInWithGoogle` | 같은 파일 | `next` | `{NEXT_PUBLIC_SITE_URL}/auth/callback` 으로 복귀 | 짧은 오류 문장 |
| `signOut` | 같은 파일 | 없음 | 세션 삭제 후 `/` | |
| `completeRole` | `src/app/onboarding/actions.ts` | `client` 또는 `freelancer`, `next` | 본인 `role` 만 저장 후 이동 | 이유 표시 |
| `updateProfile` | `src/app/me/profile/actions.ts` | 프로필 칸, `avatar_url`, `next` | 본인 행만 수정 | 칸 아래 이유 |

`next` 는 `/` 로 시작하는 내부 경로만 살립니다. `//`, `https://`, 역슬래시가 있으면 `/` 로 바꿉니다. 구현은 `src/lib/supabase/profile.ts` 의 `safeNext` 입니다.

이미지는 서버 동작에 파일을 넣지 않습니다. 브라우저가 Storage에 올린 뒤 공개 주소만 `avatar_url` 로 저장합니다. jpg, png, webp, 5MB 이하입니다.

## 4. 화면과 헤더가 읽는 값

헤더 `src/components/layout/header.tsx` 는 브라우저에서 세션을 확인합니다. 서버 컴포넌트에서 쿠키를 읽어 메뉴를 그리면 현재 Next.js 빌드에서 세션 객체가 어긋날 수 있어, 화면이 열린 뒤에 확인합니다.

로그인 전 메뉴는 회원가입과 로그인입니다. 역할이 없으면 내 프로필과 로그아웃만 보입니다. 의뢰인은 내 프로젝트, 프리랜서는 내 지원 현황과 북마크가 추가됩니다. 알림 아이콘 자리는 `data-slot="header-notifications"` 이고 3번 컴포넌트를 끼웁니다. 공개 프로필의 리뷰 자리는 `data-slot="public-reviews"` 이고 5번 `PublicReviews` 를 끼웁니다. 1번은 그 자리에 데이터를 만들지 않습니다.

공통 목록 `src/lib/constants.ts`:

- `ROLES`: `client` 의뢰인, `freelancer` 프리랜서
- `CATEGORIES`: 웹 개발, 앱 개발, 디자인, 기획, 데이터·AI
- `SKILLS`: JavaScript, TypeScript, React, Next.js, Vue, HTML/CSS, Node.js, Python, Java, Kotlin, Swift, PHP, SQL, Figma

## 5. 환경 변수

| 이름 | 어디 쓰나 | 공개 여부 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 브라우저와 서버 | 공개 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 브라우저와 서버. RLS가 지킴 | 공개 |
| `NEXT_PUBLIC_SITE_URL` | 구글 로그인 복귀 주소 | 공개 |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용 관리 작업 | 비공개 |
| `NEXT_TOSS_CLIENT_KEY` | 5번 결제창. 서버가 읽어 버튼에만 넘김 | 이름에 `NEXT_PUBLIC_` 를 붙이지 않음 |
| `TOSS_SECRET_KEY` | 5번 승인 | 비공개. `test_` 로 시작할 때만 사용 |

값은 `.env.local` 과 Vercel Environment Variables 에만 둡니다. 예시 이름만 `.env.example` 에 있습니다.

## 6. 배포 절차

1. GitHub `main` 이 갱신되면 Vercel 프로젝트 `workbridge` 가 프로덕션을 다시 만듭니다.
2. 사이트 주소는 `https://workbridge-tom-f7d5.vercel.app` 입니다.
3. Supabase Authentication → URL Configuration 의 Site URL 과 Redirect URLs 에 위 주소의 `/auth/callback` 과 로컬 `http://localhost:3000/auth/callback` 이 있어야 합니다.
4. 환경 변수를 추가하거나 이름을 바꾸면, 이미 떠 있는 배포에는 들어가지 않습니다. 변수가 필요한 코드가 `main`에 합쳐진 뒤 프로덕션을 한 번 더 배포합니다.
5. 배포가 로그인 벽 뒤에 가려져 있으면 프로덕션은 주소만으로 열리게 두고, 미리보기만 보호할 수 있습니다.

## 7. 매일 브랜치 합치기 절차

담당 브랜치는 `feat/1-auth-profile`, `feat/2-projects`, `feat/3-applications-notifications`, `feat/4-ai-contract`, `feat/5-payment-review` 입니다.

1. `git fetch origin` 으로 원격 브랜치를 가져옵니다.
2. `git rev-list --left-right --count origin/main...origin/<브랜치>` 로 `main`에 없는 커밋이 있는지 봅니다. 오른쪽 수가 0이면 합칠 내용이 없습니다.
3. 합칠 브랜치가 둘 이상이면 `git diff --name-only origin/main...<브랜치>` 로 파일 목록을 비교합니다. 같은 파일이 있으면 멈추고 해당 번호에게 알립니다.
4. 겹치지 않으면 `main`에서 `git merge --no-ff` 로 한 브랜치씩 합칩니다.
5. `npm run build` 가 실패하면 `main`에 푸시하지 않습니다.
6. 성공하면 `origin/main` 에 푸시합니다.
7. 새로 들어온 `supabase/migrations` 파일이 있으면, 공용 데이터베이스 SQL Editor에서 번호 순서대로 아직 실행하지 않은 파일만 실행하라고 팀에 알립니다. 이미 성공한 파일은 다시 실행하지 않습니다.

커밋 메시지는 제목과 본문을 합쳐 500자 이상 700자 이하입니다. 공백과 줄바꿈도 글자 수에 포함합니다.

## 8. 완료로 보는 조건

- 이메일 가입, 로그인, 로그아웃, 구글 복귀가 동작하고 역할이 없으면 역할 화면으로 갑니다.
- 본인만 프로필과 사진을 수정하고, 다른 회원 행은 바뀌지 않습니다.
- 공개 프로필에서 이메일이 보이지 않습니다.
- `main` 배포 주소가 로그인 없이 열리고, 구글 로그인 복귀 주소가 Supabase에 등록되어 있습니다.
- 저녁 합치기 뒤에 빌드가 성공한 `main`만 원격에 있습니다.

## 9. 이번 주에 만들지 않는 것

비밀번호 찾기, 이메일 변경, 회원 탈퇴, 페이스북·카카오 로그인, 약관 화면, 홈과 프로젝트 본문, 알림·리뷰의 실제 데이터.

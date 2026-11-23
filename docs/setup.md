# WorkBridge 준비 (1번)

비밀 키는 이 파일에 적지 않습니다. `.env.local` 도 깃에 올리지 않습니다. 키는 개인 메시지로만 주고받습니다.

목·금에 Vercel 주소와 Supabase Redirect URL 을 이 문서에 이어서 적습니다.

## 지금 상태 (2026년 11월 24일, 한국시간)

프로젝트는 만들어 두었습니다. 키 값은 이 문서에 없습니다.

| 항목 | 값 |
| --- | --- |
| 이름 | `workbridge` |
| 지역 | 서울 (Northeast Asia) |
| API 주소 | `https://tztgirorrcahhrrqrain.supabase.co` |
| 대시보드 | https://supabase.com/dashboard/project/tztgirorrcahhrrqrain |
| 프로필 테이블 | 실행 완료. `profiles` 와 Storage `avatars` 가 있습니다. SQL을 다시 실행하지 마세요. |

아직 대시보드에서만 할 수 있는 것:

1. **Project Settings → API** 에서 `service_role`(secret) 키를 복사해 `.env.local` 의 `SUPABASE_SERVICE_ROLE_KEY` 에 넣습니다. 이 연결로는 비밀 키가 나오지 않습니다.
2. **Authentication → Sign In / Providers → Email** 에서 **Confirm email** 을 끕니다. https://supabase.com/dashboard/project/tztgirorrcahhrrqrain/auth/providers
3. **Authentication → URL Configuration** 에서 Site URL 은 `http://localhost:3000`, Redirect URLs 에는 `http://localhost:3000/auth/callback` 을 넣습니다. https://supabase.com/dashboard/project/tztgirorrcahhrrqrain/auth/url-configuration

구글 로그인 리디렉션 주소는 `https://tztgirorrcahhrrqrain.supabase.co/auth/v1/callback` 입니다.

## 1. Supabase 프로젝트 만들기

1. [supabase.com](https://supabase.com) 에 가입하거나 로그인합니다.
2. **New project** 를 누릅니다.
3. 조직은 본인 계정의 무료 조직을 고릅니다. 팀원과 대시보드를 같이 쓰지 않아도 됩니다. 팀원은 키만 받아서 같은 프로젝트에 접속합니다.
4. 프로젝트 이름: `workbridge`
5. 데이터베이스 비밀번호: 대시보드에 다시 들어갈 때 쓰는 비밀번호입니다. 비밀번호 관리자에 저장합니다. 이 비밀번호는 `.env.local` 에 넣지 않습니다.
6. 리전: **Northeast Asia (Seoul)** 이 있으면 그걸 고릅니다. 없으면 가장 가까운 아시아 리전을 고릅니다.
7. 만들기가 끝날 때까지 기다립니다. 몇 분 걸릴 수 있습니다.

## 2. 키를 `.env.local` 에 넣기

대시보드에서 **Project Settings → API** 를 엽니다. 화면 이름이 Data API 로 바뀌어 있어도 같은 곳입니다.

복사할 값 세 가지:

| 대시보드에 보이는 이름 | 넣을 변수 | 어디에 써도 되나 |
| --- | --- | --- |
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` | 브라우저에 나와도 됩니다 |
| `anon` `public` 키. 새 화면에서는 publishable 키 | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 브라우저에 나와도 됩니다. 표에 없는 데이터는 RLS 가 막습니다 |
| `service_role` 키. 새 화면에서는 secret 키 | `SUPABASE_SERVICE_ROLE_KEY` | 서버만. `NEXT_PUBLIC_` 을 붙이면 안 됩니다 |

내 컴퓨터의 프로젝트 폴더에서:

```bash
cp .env.example .env.local
```

`.env.local` 예시 (값은 본인 키로 바꿉니다):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=대시보드의 anon 또는 publishable 키
NEXT_PUBLIC_SITE_URL=http://localhost:3000

SUPABASE_SERVICE_ROLE_KEY=대시보드의 service_role 또는 secret 키
```

`TOSS_SECRET_KEY` 와 `OPENAI_API_KEY` 는 4번·5번 담당입니다. 1번이 채우지 않습니다.

이 세 값(URL, anon, service role)을 2·3·4·5번에게 **개인 메시지**로 보냅니다. 단톡방, GitHub, 이 문서에는 붙이지 않습니다.

클라우드 에이전트 화면에 키를 붙여 넣어도, 그 파일은 내 노트북에 자동으로 생기지 않습니다. 노트북의 `.env.local` 에 직접 저장해야 `npm run dev` 가 데이터베이스에 연결됩니다.

## 3. 프로필 테이블 실행

1. 대시보드 **SQL Editor → New query**
2. 저장소의 `supabase/migrations/0100_profiles.sql` 내용 전체를 붙여 넣습니다.
3. **Run**
4. 왼쪽 Table Editor 에 `profiles` 가 보이고, Storage 에 `avatars` 버킷이 있으면 성공입니다.

이 SQL을 실행하기 전에 만들어 둔 테스트 계정은 프로필 행이 생기지 않습니다. 그 계정은 Authentication 에서 지운 뒤 다시 가입합니다.

에러가 나면 문장 일부를 고쳐서 다시 실행하지 말고, 에러 글을 1번 에이전트에게 그대로 보여 주세요. 중간에 잘리면 테이블만 생기고 보안 규칙이 빠질 수 있습니다.

다른 번호의 SQL(`0200`부터)은 각 담당자가 만들고, 번호 순서대로 이어서 실행합니다.

## 4. 가입 메일을 끄기 (이번 주만)

**Authentication → Sign In / Providers → Email** 에서 **Confirm email** 을 끕니다.

켜 두면 가입 메일의 링크를 눌러야 로그인됩니다. 수요일 시연이 메일함에서 멈춥니다. 수업 프로젝트라서 끄고, 팀원은 본인 이메일로만 가입합니다. 이유는 `docs/decisions/2026-11-23-profiles.md`.

같은 화면 근처의 URL 설정:

- Site URL: `http://localhost:3000`
- Redirect URLs 에 추가: `http://localhost:3000/auth/callback`

배포 주소는 금요일에 여기 추가합니다.

## 5. 구글 로그인 (화요일에 이어서)

소셜 로그인은 구글 하나만 씁니다. 이유: `docs/decisions/2026-11-23-social-login.md`.

1. [Google Cloud Console](https://console.cloud.google.com/) 에서 프로젝트 하나를 만듭니다.
2. **API 및 서비스 → 사용자 인증 정보 → OAuth 클라이언트 ID** (웹 애플리케이션)
3. 승인된 리디렉션 URI 에 Supabase 가 안내하는 주소를 넣습니다. 모양은 `https://프로젝트ID.supabase.co/auth/v1/callback` 입니다. Supabase **Authentication → Providers → Google** 화면에 그대로 적혀 있습니다.
4. 받은 클라이언트 ID 와 클라이언트 보안 비밀번호를 Supabase Google 제공자에 붙여 넣고 저장합니다.
5. 이 값도 `.env.local` 이나 GitHub 에 넣지 않습니다. Supabase 안에만 있습니다.

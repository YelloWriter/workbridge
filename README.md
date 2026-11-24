# WorkBridge

의뢰인과 프리랜서를 안전하게 연결하는 외주 매칭 플랫폼 MVP (Next.js + Supabase + Vercel).

- 팀 운영 규칙·담당 영역·DB 약속: [docs/TEAM.md](docs/TEAM.md)
- 환경 변수 목록: [.env.example](.env.example)

## 실행 방법

```bash
npm install
cp .env.example .env.local   # 값 채우기
npm run dev                   # http://localhost:3000
```

## DB 재현 방법

데이터베이스는 회원, 프로젝트, 북마크가 저장되는 공용 창고입니다. 코드를 받아도 창고 안 표는 자동으로 생기지 않습니다. 아래 SQL 파일을 번호가 작은 것부터 한 번씩 실행해야 합니다.

SQL 파일은 표 만들기 지시서입니다. 파일 내용을 사람이 고치지 말고, 통째로 복사해서 Supabase에 실행합니다.

### 팀이 쓰는 창고

새 Supabase 프로젝트를 만들지 마세요. 이미 있는 공용 프로젝트를 씁니다.

| 항목 | 값 |
| --- | --- |
| 이름 | `workbridge` |
| 지역 | 서울 |
| 주소 | `https://tztgirorrcahhrrqrain.supabase.co` |
| 대시보드 | https://supabase.com/dashboard/project/tztgirorrcahhrrqrain |

화면을 돌리려면 1번이 개인 메시지로 보낸 주소와 키를 내 컴퓨터의 `.env.local`에 넣습니다. 키를 이 문서, GitHub, 단톡방에 붙여 넣지 마세요. 넣는 칸 이름은 [docs/setup.md](docs/setup.md)에 있습니다.

### 지금 실행 상태 (2026년 11월 24일)

| 순서 | 파일 | 생기는 것 | 공용 창고 |
| --- | --- | --- | --- |
| 1 | `supabase/migrations/0100_profiles.sql` | 회원 프로필 표, 가입하면 프로필이 자동으로 생기는 장치, 프로필 사진 보관함 `avatars` | 이미 실행됨. 다시 실행하지 않음 |
| 2 | `supabase/migrations/0200_projects.sql` | 프로젝트 표. 의뢰인이 올린 외주 글 | 이미 실행됨. 다시 실행하지 않음 |
| 3 | `supabase/migrations/0201_bookmarks.sql` | 북마크 표. 프리랜서가 프로젝트를 찜하는 기록 | 이미 실행됨. 다시 실행하지 않음 |
| 4 | `supabase/migrations/0300_applications.sql` 다음 파일들 | 지원, 알림, 계약, 결제, 리뷰 | 아직 실행 안 됨. 번호 순서대로, 한 파일씩 |

앞으로 파일이 더 생기면 파일 이름 앞의 숫자가 실행 순서입니다.

- `0100`~`0199`: 1번 (로그인·프로필)
- `0200`~`0299`: 2번 (프로젝트·북마크)
- `0300`~`0399`: 3번 (지원·알림)
- `0400`~`0499`: 4번 (견적·계약)
- `0500`~`0599`: 5번 (결제·리뷰)

`0201`을 `0200`보다 먼저 실행하면 실패합니다. 북마크는 프로젝트가 있어야 붙기 때문입니다.

### 파일 하나 실행하는 방법

아직 안 돌린 파일만 하면 됩니다. 다음은 `0300_applications.sql`입니다. 그 앞에 `0100`, `0200`, `0201`은 이미 끝났습니다.

1. 브라우저에서 SQL을 붙여 넣는 화면을 엽니다. https://supabase.com/dashboard/project/tztgirorrcahhrrqrain/sql/new
2. GitHub에서 실행할 파일을 엽니다. 파일 전체를 선택해서 복사합니다. 맨 위 설명 주석부터 맨 마지막 줄까지입니다.
   - 0200: https://github.com/YelloWriter/workbridge/blob/main/supabase/migrations/0200_projects.sql
   - 0201: https://github.com/YelloWriter/workbridge/blob/main/supabase/migrations/0201_bookmarks.sql
3. Supabase 화면의 빈 칸에 붙여 넣습니다. 예전에 적어 둔 글이 있으면 지우고 이번 파일만 남깁니다.
4. 오른쪽 아래 **Run**을 누릅니다. 키보드라면 Ctrl+Enter (맥은 Command+Enter)입니다.
5. 아래에 초록색 **Success**가 보이면 그 파일은 끝난 것입니다. 다음 번호 파일로 넘어가 새 쿼리 화면에서 같은 일을 반복합니다.

성공했는지 눈으로 확인하려면 왼쪽 **Table Editor**를 엽니다.

- `0100` 이후: `profiles`가 보여야 합니다. 왼쪽 **Storage**에는 `avatars`가 있어야 합니다.
- `0200` 이후: `projects`가 보여야 합니다.
- `0201` 이후: `bookmarks`가 보여야 합니다.

### 이렇게 하면 안 됩니다

- 성공한 파일을 또 실행하지 않습니다. `already exists` 같은 글이 나오면, 그 표는 이미 있는 것입니다. 다음 번호로 가면 됩니다.
- 에러가 났다고 문장을 직접 고쳐서 다시 실행하지 않습니다. 앞부분만 만들어지고 보안 규칙은 빠질 수 있습니다.
- 에러 글을 그대로 복사해서 그 파일 담당자에게 보냅니다. 0100은 1번, 0200과 0201은 2번입니다.
- 여러 파일을 한 칸에 이어 붙이지 않습니다. 파일 하나, Run 한 번입니다.

### 창고를 비우고 처음부터 다시 만들 때만

평소에는 이 절을 쓰지 않습니다. 공용 프로젝트를 지우고 새로 만든 뒤에만, 아래 순서대로 다시 실행합니다.

1. [docs/setup.md](docs/setup.md)대로 프로젝트를 만들고, 가입 메일 확인을 끄고, 사이트 주소를 넣습니다.
2. `0100_profiles.sql` 전체를 Run 합니다.
3. `0200_projects.sql` 전체를 Run 합니다.
4. `0201_bookmarks.sql` 전체를 Run 합니다.
5. 그 뒤에 번호가 더 큰 파일이 있으면 작은 번호부터 같은 방식으로 이어서 실행합니다.

이 SQL을 실행하기 전에 만들어 둔 테스트 계정은 프로필 줄이 생기지 않습니다. 그 계정은 Authentication에서 지운 뒤 다시 가입합니다.

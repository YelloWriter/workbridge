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

Supabase 대시보드 SQL Editor에서 `supabase/migrations/` 의 SQL 파일을 번호 순서대로 실행합니다. (자세한 내용은 1번 담당이 이 섹션을 채웁니다)

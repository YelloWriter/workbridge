-- 0201_bookmarks.sql  (담당: 2번)
-- 북마크 테이블 + 보안 규칙(RLS). 0200_projects.sql 다음에 실행합니다.

create table public.bookmarks (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, project_id)          -- 같은 프로젝트 중복 북마크 불가
);

create index bookmarks_project_id_idx on public.bookmarks (project_id);

alter table public.bookmarks enable row level security;

-- 북마크는 본인 것만 보고, 만들고, 지울 수 있습니다. (수정 기능 없음)
create policy "bookmarks_select_own"
  on public.bookmarks for select
  to authenticated
  using (user_id = auth.uid());

create policy "bookmarks_insert_own"
  on public.bookmarks for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "bookmarks_delete_own"
  on public.bookmarks for delete
  to authenticated
  using (user_id = auth.uid());

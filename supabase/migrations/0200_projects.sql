-- 0200_projects.sql  (담당: 2번)
-- 프로젝트 테이블 + 보안 규칙(RLS)
-- 먼저 1번의 profiles 테이블(0100번대)이 만들어져 있어야 합니다.
-- 상태값은 docs/TEAM.md 2장 그대로입니다.

create table public.projects (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.profiles (id),
  title            text not null,
  description      text not null,
  category         text not null,
  skills           text[] not null default '{}',
  budget           bigint not null check (budget >= 0),          -- 원 단위
  recruit_start_at timestamptz not null,
  recruit_end_at   timestamptz not null,
  status           text not null default 'recruiting'
                   check (status in (
                     'scheduled', 'recruiting', 'closed', 'contract_pending',
                     'in_progress', 'delivered', 'completed', 'cancelled'
                   )),
  deleted_at       timestamptz,                                   -- 소프트 삭제
  created_at       timestamptz not null default now(),
  check (recruit_end_at > recruit_start_at)
);

create index projects_client_id_idx  on public.projects (client_id);
create index projects_status_idx     on public.projects (status)     where deleted_at is null;
create index projects_category_idx   on public.projects (category)   where deleted_at is null;
create index projects_created_at_idx on public.projects (created_at desc) where deleted_at is null;
create index projects_skills_idx     on public.projects using gin (skills);

-- 로그인한 사람이 의뢰인(client)인지 확인하는 도우미
create or replace function public.is_client()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'client'
  );
$$;

alter table public.projects enable row level security;

-- 누구나 조회 (삭제된 건 제외)
create policy "projects_select_public"
  on public.projects for select
  to anon, authenticated
  using (deleted_at is null);

-- 등록: 의뢰인 본인만, 처음 상태는 scheduled 또는 recruiting 만 가능
create policy "projects_insert_own_client"
  on public.projects for insert
  to authenticated
  with check (
    client_id = auth.uid()
    and public.is_client()
    and status in ('scheduled', 'recruiting')
    and deleted_at is null
  );

-- 수정: 의뢰인 본인만 (삭제 표시는 아래 soft_delete_project 함수로만)
create policy "projects_update_own_client"
  on public.projects for update
  to authenticated
  using (client_id = auth.uid() and deleted_at is null)
  with check (client_id = auth.uid() and deleted_at is null);

-- 삭제(소프트 삭제): 직접 delete 는 막혀 있고, 이 함수로만 deleted_at 을 채웁니다.
-- 진행 중(contract_pending, in_progress, delivered)·완료 건은 삭제할 수 없습니다.
create or replace function public.soft_delete_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.projects
     set deleted_at = now()
   where id = p_project_id
     and client_id = auth.uid()
     and deleted_at is null
     and status in ('scheduled', 'recruiting', 'closed', 'cancelled');

  if not found then
    raise exception 'cannot delete this project';
  end if;
end;
$$;

revoke all on function public.soft_delete_project(uuid) from public, anon;
grant execute on function public.soft_delete_project(uuid) to authenticated;

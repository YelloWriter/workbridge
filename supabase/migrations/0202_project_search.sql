-- 0202_project_search.sql  (담당: 2번)
-- 0200, 0201 다음에 실행합니다. 0300(지원)보다 먼저 또는 나중에 실행해도 됩니다.
-- 하는 일: ①화면에 보여 줄 모집 상태 계산 ②목록 검색·필터·정렬·페이지
--          ③지원자 수 ④지원자가 있으면 예산·마감일을 못 바꾸게 막기

-- ① 화면에 보이는 모집 상태. DB의 status 가 아직 시간을 따라가지 못했어도 시간을 기준으로 맞춥니다.
--   scheduled(모집 예정) / recruiting(모집 중) / closed(모집 마감)
--   TEAM.md: 모집 예정·모집 중 외의 모든 상태는 외부에서 "모집 마감" 으로 보입니다.
create or replace function public.project_display_status(
  p_status text, p_start timestamptz, p_end timestamptz
) returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_status = 'scheduled' and p_start > now() then 'scheduled'
    when p_status in ('scheduled', 'recruiting') and p_end > now() then 'recruiting'
    else 'closed'
  end;
$$;

grant execute on function public.project_display_status(text, timestamptz, timestamptz)
  to anon, authenticated, service_role;

-- ② 목록 검색. 삭제되지 않은 프로젝트만, 누구나 호출할 수 있습니다. (조회 규칙은 projects 의 공개 조회와 같음)
create or replace function public.search_projects(
  p_q             text default null,          -- 제목+설명에 들어 있는 글자
  p_category      text default null,
  p_budget_min    bigint default null,
  p_budget_max    bigint default null,
  p_skills        text[] default null,        -- 하나라도 겹치면 포함
  p_deadline_from timestamptz default null,   -- 모집 마감일 범위
  p_deadline_to   timestamptz default null,
  p_status        text default null,          -- scheduled | recruiting | closed (화면 표시 기준)
  p_sort          text default 'latest',      -- latest | deadline | budget
  p_limit         integer default 10,
  p_offset        integer default 0
) returns table (
  id uuid, client_id uuid, title text, description text, category text, skills text[],
  budget bigint, recruit_start_at timestamptz, recruit_end_at timestamptz,
  status text, display_status text, created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pat text;
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  -- % 와 _ 는 검색 기호가 아니라 글자로 취급합니다.
  v_pat := case
    when nullif(btrim(p_q), '') is null then null
    else '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  end;

  return query
  with picked as (
    select p.*,
           public.project_display_status(p.status, p.recruit_start_at, p.recruit_end_at) as ds
      from public.projects p
     where p.deleted_at is null
       and (v_pat is null or p.title ilike v_pat or p.description ilike v_pat)
       and (p_category is null or p.category = p_category)
       and (p_budget_min is null or p.budget >= p_budget_min)
       and (p_budget_max is null or p.budget <= p_budget_max)
       and (p_skills is null or cardinality(p_skills) = 0 or p.skills && p_skills)
       and (p_deadline_from is null or p.recruit_end_at >= p_deadline_from)
       and (p_deadline_to is null or p.recruit_end_at <= p_deadline_to)
  )
  select x.id, x.client_id, x.title, x.description, x.category, x.skills,
         x.budget, x.recruit_start_at, x.recruit_end_at,
         x.status, x.ds, x.created_at,
         count(*) over ()
    from picked x
   where p_status is null or x.ds = p_status
   order by
     case when p_sort = 'budget' then x.budget end desc nulls last,
     case when p_sort = 'deadline' then (x.ds = 'closed')::integer end asc nulls last,
     case when p_sort = 'deadline' then x.recruit_end_at end asc nulls last,
     x.created_at desc, x.id
   limit v_limit offset v_offset;
end;
$$;

revoke all on function public.search_projects(text, text, bigint, bigint, text[], timestamptz, timestamptz, text, text, integer, integer) from public;
grant execute on function public.search_projects(text, text, bigint, bigint, text[], timestamptz, timestamptz, text, text, integer, integer)
  to anon, authenticated, service_role;

-- ③ 프로젝트별 지원자 수. 지원서 내용은 보이지 않고 숫자만 돌려줍니다.
--   (검색 함수와 따로 둔 이유: 0300 지원 테이블이 아직 없어도 검색이 되게 하려는 것)
create or replace function public.project_applicant_counts(p_project_ids uuid[])
returns table (project_id uuid, applicant_count integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if to_regclass('public.applications') is null then
    return;
  end if;
  return query
  select a.project_id, count(*)::integer
    from public.applications a
    join public.projects p on p.id = a.project_id and p.deleted_at is null
   where a.project_id = any (p_project_ids) and a.deleted_at is null
   group by a.project_id;
end;
$$;

revoke all on function public.project_applicant_counts(uuid[]) from public;
grant execute on function public.project_applicant_counts(uuid[]) to anon, authenticated, service_role;

-- ④ 지원자가 있는 프로젝트는 예산과 모집 마감일을 바꿀 수 없습니다.
--   화면에서도 막지만, 직접 요청이 와도 여기서 한 번 더 막습니다.
--   다른 번호가 만든 DB 함수(수락 등)는 예산·마감일을 바꾸지 않으므로 영향이 없습니다.
create or replace function public.projects_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.budget is distinct from old.budget
      or new.recruit_end_at is distinct from old.recruit_end_at)
     and to_regclass('public.applications') is not null
     and exists (select 1 from public.applications a
                  where a.project_id = old.id and a.deleted_at is null) then
    raise exception 'HAS_APPLICANTS: 지원자가 있는 프로젝트는 예산과 모집 마감일을 바꿀 수 없습니다.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists projects_guard_update on public.projects;
create trigger projects_guard_update
  before update on public.projects
  for each row execute function public.projects_guard_update();

-- ⑤ 삭제(소프트 삭제) 함수를 한 번 더 조입니다. (0200 의 같은 이름 함수를 덮어씁니다)
--   모집 예정·모집 중인데 지원자가 있으면 지울 수 없습니다. 먼저 모집을 마감해야 합니다.
--   (지원자가 갈 곳 없이 남는 것을 막기 위함)
create or replace function public.soft_delete_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status
    from public.projects
   where id = p_project_id and client_id = auth.uid() and deleted_at is null
   for update;

  if not found or v_status not in ('scheduled', 'recruiting', 'closed', 'cancelled') then
    raise exception 'cannot delete this project';
  end if;

  if v_status in ('scheduled', 'recruiting')
     and to_regclass('public.applications') is not null
     and exists (select 1 from public.applications a
                  where a.project_id = p_project_id and a.deleted_at is null) then
    raise exception 'HAS_APPLICANTS_CLOSE_FIRST';
  end if;

  update public.projects set deleted_at = now() where id = p_project_id;
end;
$$;

revoke all on function public.soft_delete_project(uuid) from public, anon;
grant execute on function public.soft_delete_project(uuid) to authenticated;

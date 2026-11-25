-- 0400_ai_estimates.sql  (담당: 4번)
-- 0200 프로젝트 다음에 실행합니다. 0401 계약보다 먼저입니다.
-- 표 이름과 칸 이름은 docs/TEAM.md 2장과 같습니다.
-- 여기 금액은 참고 견적입니다. 합의 금액은 0401의 contracts.agreed_amount 입니다.

begin;

create table public.ai_estimates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id),
  client_id uuid not null references public.profiles (id),
  items jsonb not null default '[]'::jsonb,
  total_amount bigint not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint ai_estimates_items_array check (jsonb_typeof(items) = 'array'),
  constraint ai_estimates_items_count check (jsonb_array_length(items) <= 100),
  constraint ai_estimates_total_amount check (total_amount between 0 and 999999999999)
);

create index ai_estimates_client_created_idx
  on public.ai_estimates (client_id, created_at desc)
  where deleted_at is null;

create index ai_estimates_project_created_idx
  on public.ai_estimates (project_id, created_at desc)
  where deleted_at is null;

comment on table public.ai_estimates is
  '프로젝트 참고 견적. 그 의뢰인만 조회한다. 합의 금액이 아니다. 4번 담당.';

comment on column public.ai_estimates.total_amount is
  '참고 합계(원). 계약 금액으로 쓰지 않는다.';

-- 탈퇴한 계정은 견적과 계약을 보지 못한다.
-- profiles.deleted_at 은 브라우저에 칸 권한이 없어서, 이 함수로만 확인한다.
create function public.ai_contract_member_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and deleted_at is null
  );
$$;

-- 프로젝트 목록 권한이 나중에 바뀌어도, 의뢰인 본인 확인은 여기서 한다.
create function public.ai_estimate_owned_by_me(p_project_id uuid, p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and p.client_id = (select auth.uid())
      and p.client_id = p_client_id
      and p.deleted_at is null
  );
$$;

revoke all on function public.ai_contract_member_is_active() from PUBLIC, anon, authenticated;
revoke all on function public.ai_estimate_owned_by_me(uuid, uuid) from PUBLIC, anon, authenticated;
grant execute on function public.ai_contract_member_is_active() to authenticated;
grant execute on function public.ai_estimate_owned_by_me(uuid, uuid) to authenticated;

-- 넣은 뒤 내용을 바꾸지 않는다. 다시 분석하면 새 행을 만든다.
-- 의뢰인 칸은 그 프로젝트의 의뢰인과 같아야 한다.
create function public.ai_estimates_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.project_id is distinct from old.project_id
       or new.client_id is distinct from old.client_id
       or new.items is distinct from old.items
       or new.total_amount is distinct from old.total_amount
       or new.created_at is distinct from old.created_at then
      raise exception 'ESTIMATE_IMMUTABLE: 참고 견적은 만든 뒤 내용을 바꾸지 않습니다.'
        using errcode = '42501';
    end if;
  end if;

  select p.client_id into v_owner
  from public.projects p
  where p.id = new.project_id
    and p.deleted_at is null;

  if v_owner is null then
    raise exception 'PROJECT_NOT_FOUND';
  end if;
  if new.client_id is distinct from v_owner then
    raise exception 'CLIENT_MISMATCH: 견적의 의뢰인은 그 프로젝트의 의뢰인과 같아야 합니다.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger ai_estimates_guard
  before insert or update on public.ai_estimates
  for each row
  execute function public.ai_estimates_guard();

revoke all on function public.ai_estimates_guard() from PUBLIC, anon, authenticated;
grant execute on function public.ai_estimates_guard() to service_role;

alter table public.ai_estimates enable row level security;

-- 조회: 살아 있는 계정이고, 그 견적의 의뢰인인 경우만.
create policy ai_estimates_select_own_client
  on public.ai_estimates
  for select
  to authenticated
  using (
    deleted_at is null
    and public.ai_contract_member_is_active()
    and client_id = (select auth.uid())
    and public.ai_estimate_owned_by_me(project_id, client_id)
  );

-- 브라우저에서 직접 넣거나 고치지 못한다. 서버 전용 키로만 쓴다.
revoke all on table public.ai_estimates from anon, authenticated, service_role;
grant select on table public.ai_estimates to authenticated;
grant select, insert, update on table public.ai_estimates to service_role;

commit;

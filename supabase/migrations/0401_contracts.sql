-- 0401_contracts.sql  (담당: 4번)
-- 0300 지원, 0400 참고 견적 다음에 실행합니다.
-- 5번 0500 결제는 이 파일 다음에 실행합니다. 결제가 읽는 칸 이름을 맞춥니다.
-- 표 이름, 상태값(negotiating, signing, signed, cancelled)은 docs/TEAM.md 2장과 같습니다.

begin;

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id),
  application_id uuid not null references public.applications (id),
  client_id uuid not null references public.profiles (id),
  freelancer_id uuid not null references public.profiles (id),
  agreed_amount numeric(12,0),
  status text not null default 'negotiating'
    check (status in ('negotiating', 'signing', 'signed', 'cancelled')),
  client_signed_at timestamptz,
  freelancer_signed_at timestamptz,
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint contracts_parties_differ check (client_id <> freelancer_id),
  constraint contracts_amount_check check (
    agreed_amount is null or agreed_amount between 1 and 999999999999
  ),
  constraint contracts_period_check check (
    start_date is null or end_date is null or end_date >= start_date
  ),
  constraint contracts_ready_to_sign_check check (
    status not in ('signing', 'signed')
    or (
      agreed_amount is not null
      and start_date is not null
      and end_date is not null
      and end_date >= start_date
    )
  ),
  constraint contracts_signature_check check (
    (
      status = 'negotiating'
      and client_signed_at is null
      and freelancer_signed_at is null
    )
    or (
      status = 'signing'
      and (client_signed_at is null or freelancer_signed_at is null)
    )
    or (
      status = 'signed'
      and client_signed_at is not null
      and freelancer_signed_at is not null
    )
    or status = 'cancelled'
  )
);

-- 지원서 한 건에 살아있는 계약은 하나. 진행 중인 계약은 프로젝트당 하나.
create unique index contracts_one_per_application
  on public.contracts (application_id)
  where deleted_at is null;

create unique index contracts_one_open_per_project
  on public.contracts (project_id)
  where deleted_at is null and status <> 'cancelled';

create index contracts_client_idx
  on public.contracts (client_id)
  where deleted_at is null;

create index contracts_freelancer_idx
  on public.contracts (freelancer_id)
  where deleted_at is null;

comment on table public.contracts is
  '금액 합의와 서명. 의뢰인과 프리랜서만 조회한다. 4번 담당.';

comment on column public.contracts.agreed_amount is
  '합의 금액(원). 비어 있으면 아직 합의 전. 결제는 이 값을 그대로 쓴다.';

create function public.set_contracts_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger contracts_set_updated_at
  before update on public.contracts
  for each row
  execute function public.set_contracts_updated_at();

revoke all on function public.set_contracts_updated_at() from PUBLIC, anon, authenticated;

-- 당사자는 프로젝트 의뢰인, 수락된 지원의 프리랜서와 같아야 한다.
-- 상태 순서: negotiating → signing → signed. 체결 전에는 cancelled 로 끝낼 수 있다.
create function public.contracts_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_project public.projects%rowtype;
  v_app public.applications%rowtype;
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.project_id is distinct from old.project_id
       or new.application_id is distinct from old.application_id
       or new.client_id is distinct from old.client_id
       or new.freelancer_id is distinct from old.freelancer_id
       or new.created_at is distinct from old.created_at then
      raise exception 'CONTRACT_PARTIES_LOCKED: 계약 당사자와 연결은 바꿀 수 없습니다.'
        using errcode = '42501';
    end if;

    if old.client_signed_at is not null
       and new.client_signed_at is distinct from old.client_signed_at then
      raise exception 'SIGNATURE_LOCKED: 이미 한 서명은 바꿀 수 없습니다.'
        using errcode = '42501';
    end if;
    if old.freelancer_signed_at is not null
       and new.freelancer_signed_at is distinct from old.freelancer_signed_at then
      raise exception 'SIGNATURE_LOCKED: 이미 한 서명은 바꿀 수 없습니다.'
        using errcode = '42501';
    end if;

    if old.status in ('signing', 'signed')
       and (
         new.agreed_amount is distinct from old.agreed_amount
         or new.start_date is distinct from old.start_date
         or new.end_date is distinct from old.end_date
       ) then
      raise exception 'CONTRACT_TERMS_LOCKED: 서명이 시작된 계약의 금액과 기간은 바꿀 수 없습니다.'
        using errcode = '42501';
    end if;

    if new.status is distinct from old.status
       and not (
         (old.status = 'negotiating' and new.status in ('signing', 'cancelled'))
         or (old.status = 'signing' and new.status in ('signed', 'cancelled'))
       ) then
      raise exception 'CONTRACT_STATUS_NOT_ALLOWED: 계약 상태 순서가 아닙니다.'
        using errcode = '42501';
    end if;
  end if;

  select * into v_project
  from public.projects
  where id = new.project_id;

  if not found or v_project.deleted_at is not null then
    raise exception 'PROJECT_NOT_FOUND';
  end if;
  if new.client_id is distinct from v_project.client_id then
    raise exception 'CLIENT_MISMATCH: 계약의 의뢰인은 그 프로젝트의 의뢰인과 같아야 합니다.'
      using errcode = '42501';
  end if;

  select * into v_app
  from public.applications
  where id = new.application_id;

  if not found or v_app.deleted_at is not null then
    raise exception 'APPLICATION_NOT_FOUND';
  end if;
  if v_app.project_id is distinct from new.project_id
     or v_app.freelancer_id is distinct from new.freelancer_id then
    raise exception 'APPLICATION_MISMATCH: 계약은 그 프로젝트에서 수락된 지원자와 연결되어야 합니다.'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if v_project.status is distinct from 'contract_pending' then
      raise exception 'PROJECT_NOT_IN_CONTRACT: 계약 대기 중인 프로젝트에만 계약을 만듭니다.';
    end if;
    if v_app.status is distinct from 'accepted' then
      raise exception 'APPLICATION_NOT_ACCEPTED: 수락된 지원에만 계약을 만듭니다.';
    end if;
  end if;

  return new;
end;
$$;

create trigger contracts_guard
  before insert or update on public.contracts
  for each row
  execute function public.contracts_guard();

revoke all on function public.contracts_guard() from PUBLIC, anon, authenticated;
grant execute on function public.contracts_guard() to service_role;

alter table public.contracts enable row level security;

-- 조회: 살아 있는 계정이고, 그 계약의 의뢰인 또는 프리랜서인 경우만.
create policy contracts_select_parties
  on public.contracts
  for select
  to authenticated
  using (
    deleted_at is null
    and public.ai_contract_member_is_active()
    and (
      client_id = (select auth.uid())
      or freelancer_id = (select auth.uid())
    )
  );

-- 브라우저에서 직접 넣거나 고치지 못한다.
-- 금액 합의 결렬과 서명은 프로젝트 상태를 같이 바꾸므로, 이후 함수 하나로 처리한다.
revoke all on table public.contracts from anon, authenticated, service_role;
grant select on table public.contracts to authenticated;
grant select, insert, update on table public.contracts to service_role;

commit;

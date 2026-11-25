-- 5번 임시 시연용. 4번 계약 표(0400)가 생기기 전에만 실행합니다.
-- 0400을 이미 실행했다면 이 파일을 실행하지 마세요. 표 모양이 겹칩니다.
-- 시연 계정은 supabase/seed.sql 이 먼저 있어야 합니다.
-- 의뢰인 client.demo@mailinator.com / 프리랜서 freelancer.demo@mailinator.com
-- 비밀번호는 seed.sql 과 같은 Workbridge-demo-1124 입니다.

begin;

do $$
begin
  if to_regclass('public.contracts') is null then
    create table public.contracts (
      id uuid primary key,
      project_id uuid not null references public.projects (id),
      application_id uuid,
      client_id uuid not null references public.profiles (id),
      freelancer_id uuid not null references public.profiles (id),
      agreed_amount bigint not null check (agreed_amount > 0),
      status text not null check (status in ('negotiating', 'signing', 'signed', 'cancelled')),
      client_signed_at timestamptz,
      freelancer_signed_at timestamptz,
      start_date date,
      end_date date,
      deleted_at timestamptz
    );
    alter table public.contracts enable row level security;
    create policy contracts_select_parties
      on public.contracts
      for select
      to authenticated
      using (
        deleted_at is null
        and (client_id = (select auth.uid()) or freelancer_id = (select auth.uid()))
      );
    grant select on table public.contracts to authenticated;
  end if;
end $$;

insert into public.contracts (
  id, project_id, client_id, freelancer_id, agreed_amount, status,
  client_signed_at, freelancer_signed_at, start_date, end_date
)
select
  '55555555-5555-4555-8555-555555555555',
  project.id,
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  5000000,
  'signed',
  now(),
  now(),
  current_date,
  current_date + 21
from public.projects project
where project.client_id = '11111111-1111-4111-8111-111111111111'
  and project.title = '쇼핑몰 상품 목록'
  and project.deleted_at is null
  and not exists (
    select 1 from public.contracts existing
    where existing.id = '55555555-5555-4555-8555-555555555555'
  )
limit 1;

update public.projects
set status = 'contract_pending'
where client_id = '11111111-1111-4111-8111-111111111111'
  and title = '쇼핑몰 상품 목록'
  and deleted_at is null
  and status in ('recruiting', 'scheduled', 'closed', 'contract_pending');

commit;

-- 5번 담당. 0200 프로젝트, 0301 알림, 0400 계약 다음에 실행합니다.
-- 0400이 없으면 contracts 가 없어서 이 파일은 실패합니다. 문장을 고치지 말고 4번 SQL을 먼저 실행하세요.
-- 수수료 계산 이유: docs/decisions/2026-11-24-payments.md

begin;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id),
  order_id text not null unique check (order_id ~ '^wb_[A-Za-z0-9_-]{6,60}$'),
  payment_key text,
  amount bigint not null check (amount > 0),
  fee_amount bigint not null check (fee_amount = (amount * 10) / 100),
  payout_amount bigint not null check (payout_amount = amount - fee_amount),
  status text not null default 'ready' check (
    status in ('ready', 'paid', 'paid_out', 'failed', 'refunded')
  ),
  approved_at timestamptz,
  paid_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (status <> 'paid' or approved_at is not null),
  check (status <> 'paid_out' or (approved_at is not null and paid_out_at is not null))
);

create unique index payments_one_active_per_contract
  on public.payments (contract_id)
  where deleted_at is null and status in ('ready', 'paid', 'paid_out');

create index payments_contract_id_idx on public.payments (contract_id);

comment on table public.payments is
  '계약 대금. 상태 변경은 이 파일의 함수로만 한다. 5번 담당.';

create function public.set_payments_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger payments_set_updated_at
  before update on public.payments
  for each row
  execute function public.set_payments_updated_at();

revoke all on function public.set_payments_updated_at() from PUBLIC, anon, authenticated;

-- 계약의 의뢰인 또는 프리랜서인지. 계약 표의 RLS를 우회하므로 당사자만 true.
create function public.payment_contract_party(p_contract_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.contracts c
    where c.id = p_contract_id
      and c.deleted_at is null
      and (
        c.client_id = (select auth.uid())
        or c.freelancer_id = (select auth.uid())
      )
  );
$$;

revoke all on function public.payment_contract_party(uuid) from PUBLIC, anon, authenticated;
grant execute on function public.payment_contract_party(uuid) to authenticated;

alter table public.payments enable row level security;

create policy payments_select_parties
  on public.payments
  for select
  to authenticated
  using (
    deleted_at is null
    and public.payment_contract_party(contract_id)
  );

revoke all on table public.payments from anon, authenticated, service_role;
grant select on table public.payments to authenticated;
grant select, insert, update on table public.payments to service_role;

-- 의뢰인이 결제를 시작합니다. 돈은 아직 안 낸 상태(ready)입니다.
create function public.start_payment(p_contract_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contract record;
  v_project record;
  v_id uuid;
  v_amount bigint;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_contract
  from public.contracts
  where id = p_contract_id
  for update;

  if not found or v_contract.deleted_at is not null then
    raise exception 'CONTRACT_NOT_FOUND';
  end if;
  if v_contract.client_id is distinct from auth.uid() then
    raise exception 'CLIENT_REQUIRED' using errcode = '42501';
  end if;
  if v_contract.status is distinct from 'signed' then
    raise exception 'CONTRACT_NOT_SIGNED';
  end if;

  select * into v_project
  from public.projects
  where id = v_contract.project_id
  for update;

  if not found or v_project.deleted_at is not null then
    raise exception 'PROJECT_NOT_FOUND';
  end if;
  if v_project.status is distinct from 'contract_pending' then
    raise exception 'PROJECT_NOT_READY_FOR_PAYMENT';
  end if;
  if exists (
    select 1 from public.payments p
    where p.contract_id = p_contract_id
      and p.deleted_at is null
      and p.status in ('ready', 'paid', 'paid_out')
  ) then
    raise exception 'PAYMENT_ALREADY_EXISTS';
  end if;

  v_amount := v_contract.agreed_amount::bigint;
  if v_amount is null or v_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  insert into public.payments (
    contract_id, order_id, amount, fee_amount, payout_amount, status
  )
  values (
    p_contract_id,
    'wb_' || replace(gen_random_uuid()::text, '-', ''),
    v_amount,
    (v_amount * 10) / 100,
    v_amount - ((v_amount * 10) / 100),
    'ready'
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- 토스 승인 API가 성공한 뒤에만 서버가 호출합니다.
create function public.mark_payment_paid(
  p_order_id text,
  p_payment_key text,
  p_amount bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_contract record;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_payment_key is null or btrim(p_payment_key) = '' then
    raise exception 'PAYMENT_KEY_REQUIRED';
  end if;

  select * into v_payment
  from public.payments
  where order_id = p_order_id
  for update;

  if not found or v_payment.deleted_at is not null then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  select * into v_contract
  from public.contracts
  where id = v_payment.contract_id
  for update;

  if v_contract.client_id is distinct from auth.uid() then
    raise exception 'CLIENT_REQUIRED' using errcode = '42501';
  end if;
  if v_payment.status is distinct from 'ready' then
    raise exception 'PAYMENT_NOT_READY';
  end if;
  if v_payment.amount is distinct from p_amount then
    raise exception 'AMOUNT_MISMATCH';
  end if;

  update public.payments
  set status = 'paid',
      payment_key = p_payment_key,
      approved_at = now()
  where id = v_payment.id;

  update public.projects
  set status = 'in_progress'
  where id = v_contract.project_id
    and status = 'contract_pending'
    and deleted_at is null;

  if not found then
    raise exception 'PROJECT_STATUS_CONFLICT';
  end if;

  perform public.create_notification(
    v_contract.freelancer_id,
    'payment_completed',
    '대금이 보관되었습니다',
    '의뢰인이 대금을 결제했습니다. 작업을 시작해 주세요.',
    '/payments/history',
    'payment_completed:' || v_payment.id::text
  );

  return v_payment.id;
end;
$$;

create function public.mark_payment_failed(p_order_id text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_client uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_payment
  from public.payments
  where order_id = p_order_id
  for update;

  if not found or v_payment.deleted_at is not null then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  select client_id into v_client
  from public.contracts
  where id = v_payment.contract_id;

  if v_client is distinct from auth.uid() then
    raise exception 'CLIENT_REQUIRED' using errcode = '42501';
  end if;
  if v_payment.status is distinct from 'ready' then
    raise exception 'PAYMENT_NOT_READY';
  end if;

  update public.payments
  set status = 'failed'
  where id = v_payment.id;

  return v_payment.id;
end;
$$;

-- 프리랜서가 결과물을 보냈다고 알립니다.
create function public.request_delivery(p_contract_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contract record;
  v_payment public.payments%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_contract
  from public.contracts
  where id = p_contract_id
  for update;

  if not found or v_contract.deleted_at is not null then
    raise exception 'CONTRACT_NOT_FOUND';
  end if;
  if v_contract.freelancer_id is distinct from auth.uid() then
    raise exception 'FREELANCER_REQUIRED' using errcode = '42501';
  end if;

  select * into v_payment
  from public.payments
  where contract_id = p_contract_id
    and deleted_at is null
    and status = 'paid'
  for update;

  if not found then
    raise exception 'ESCROW_REQUIRED';
  end if;

  update public.projects
  set status = 'delivered'
  where id = v_contract.project_id
    and status = 'in_progress'
    and deleted_at is null;

  if not found then
    raise exception 'PROJECT_NOT_IN_PROGRESS';
  end if;

  perform public.create_notification(
    v_contract.client_id,
    'delivery_requested',
    '납품 확인을 요청했습니다',
    '프리랜서가 작업을 마쳤다고 알렸습니다. 결과물을 확인해 주세요.',
    '/payments/' || p_contract_id::text,
    'delivery_requested:' || p_contract_id::text
  );

  return v_payment.id;
end;
$$;

-- 의뢰인이 완료를 승인하면 정산 완료로 바꿉니다.
create function public.approve_delivery(p_contract_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contract record;
  v_payment public.payments%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_contract
  from public.contracts
  where id = p_contract_id
  for update;

  if not found or v_contract.deleted_at is not null then
    raise exception 'CONTRACT_NOT_FOUND';
  end if;
  if v_contract.client_id is distinct from auth.uid() then
    raise exception 'CLIENT_REQUIRED' using errcode = '42501';
  end if;

  select * into v_payment
  from public.payments
  where contract_id = p_contract_id
    and deleted_at is null
    and status = 'paid'
  for update;

  if not found then
    raise exception 'ESCROW_REQUIRED';
  end if;

  update public.projects
  set status = 'completed'
  where id = v_contract.project_id
    and status = 'delivered'
    and deleted_at is null;

  if not found then
    raise exception 'PROJECT_NOT_DELIVERED';
  end if;

  update public.payments
  set status = 'paid_out',
      paid_out_at = now()
  where id = v_payment.id;

  perform public.create_notification(
    v_contract.freelancer_id,
    'delivery_approved',
    '완료가 승인되었습니다',
    '의뢰인이 작업을 확인했습니다. 정산 금액이 확정되었습니다.',
    '/payments/history',
    'delivery_approved:' || v_payment.id::text
  );
  perform public.create_notification(
    v_contract.client_id,
    'review_requested',
    '리뷰를 남겨 주세요',
    '완료된 작업에 대해 프리랜서를 평가해 주세요.',
    '/reviews/new/' || p_contract_id::text,
    'review_requested:' || v_contract.client_id::text || ':' || p_contract_id::text
  );
  perform public.create_notification(
    v_contract.freelancer_id,
    'review_requested',
    '리뷰를 남겨 주세요',
    '완료된 작업에 대해 의뢰인을 평가해 주세요.',
    '/reviews/new/' || p_contract_id::text,
    'review_requested:' || v_contract.freelancer_id::text || ':' || p_contract_id::text
  );

  return v_payment.id;
end;
$$;

revoke all on function public.start_payment(uuid) from PUBLIC, anon, authenticated;
revoke all on function public.mark_payment_paid(text, text, bigint) from PUBLIC, anon, authenticated;
revoke all on function public.mark_payment_failed(text) from PUBLIC, anon, authenticated;
revoke all on function public.request_delivery(uuid) from PUBLIC, anon, authenticated;
revoke all on function public.approve_delivery(uuid) from PUBLIC, anon, authenticated;

grant execute on function public.start_payment(uuid) to authenticated, service_role;
grant execute on function public.mark_payment_paid(text, text, bigint) to authenticated, service_role;
grant execute on function public.mark_payment_failed(text) to authenticated, service_role;
grant execute on function public.request_delivery(uuid) to authenticated, service_role;
grant execute on function public.approve_delivery(uuid) to authenticated, service_role;

commit;

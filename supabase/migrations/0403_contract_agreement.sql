-- 0403_contract_agreement.sql  (담당: 4번)
-- 0301 알림 함수, 0401 계약 표 다음에 실행합니다.
-- 수락 금액은 3번의 accept_application(p_application_id, p_agreed_amount)가 저장합니다.
-- 여기 함수는 그 금액에 대한 동의, 거부, 서명만 합니다.
-- 프로젝트 행을 먼저 잠그고, 알림은 3번의 create_notification 을 같은 작업 안에서 보냅니다.

begin;

-- 의뢰인이 수락하며 금액을 저장하면, 선정된 프리랜서에게 금액 제안을 알립니다.
-- 3번 파일을 고치지 않고, 그 저장이 끝난 직후에만 실행됩니다.
create function public.notify_amount_proposed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.accepted_agreed_amount is null then
    return new;
  end if;
  perform public.create_notification(
    new.freelancer_id,
    'amount_proposed',
    '합의 금액이 제안되었습니다',
    '의뢰인이 수락할 때 적은 금액을 계약 목록에서 확인하고, 동의하거나 거절해 주세요.',
    '/contracts',
    'amount-proposed:' || new.id
  );
  return new;
end;
$$;

drop trigger if exists applications_notify_amount_proposed on public.applications;
create trigger applications_notify_amount_proposed
  after update of status on public.applications
  for each row
  when (old.status is distinct from new.status and new.status = 'accepted' and new.deleted_at is null)
  execute function public.notify_amount_proposed();

revoke all on function public.notify_amount_proposed() from PUBLIC, anon, authenticated;

create function public.agree_contract_amount(p_application_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_project public.projects%rowtype;
  v_app public.applications%rowtype;
  v_id uuid;
  v_start date;
  v_end date;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not public.ai_contract_member_is_active() then
    raise exception 'NOT_ACTIVE' using errcode = '42501';
  end if;

  select project_id into v_project_id
  from public.applications
  where id = p_application_id and deleted_at is null;
  if v_project_id is null then
    raise exception 'APPLICATION_NOT_FOUND';
  end if;

  select * into v_project from public.projects where id = v_project_id for update;
  if not found or v_project.deleted_at is not null then
    raise exception 'PROJECT_NOT_FOUND';
  end if;

  select * into v_app
  from public.applications
  where id = p_application_id and deleted_at is null
  for update;
  if not found then
    raise exception 'APPLICATION_NOT_FOUND';
  end if;
  if v_app.freelancer_id is distinct from (select auth.uid())
     or not exists (
       select 1 from public.profiles
       where id = (select auth.uid()) and role = 'freelancer' and deleted_at is null
     ) then
    raise exception 'NOT_THE_FREELANCER' using errcode = '42501';
  end if;

  select id into v_id
  from public.contracts
  where application_id = v_app.id and deleted_at is null;
  if v_id is not null then
    return v_id;
  end if;

  if v_project.status is distinct from 'contract_pending' then
    raise exception 'PROJECT_NOT_IN_CONTRACT';
  end if;
  if v_app.status is distinct from 'accepted' then
    raise exception 'APPLICATION_NOT_ACCEPTED';
  end if;
  if v_app.accepted_agreed_amount is null
     or v_app.accepted_agreed_amount < 1
     or v_app.accepted_agreed_amount <> trunc(v_app.accepted_agreed_amount) then
    raise exception 'AMOUNT_MISSING' using errcode = '22023';
  end if;

  v_start := (timezone('Asia/Seoul', now()))::date;
  v_end := v_start + v_app.proposed_days;

  insert into public.contracts (
    project_id, application_id, client_id, freelancer_id,
    agreed_amount, status, start_date, end_date
  ) values (
    v_project.id, v_app.id, v_project.client_id, v_app.freelancer_id,
    v_app.accepted_agreed_amount, 'signing', v_start, v_end
  ) returning id into v_id;

  perform public.create_notification(
    v_project.client_id,
    'amount_agreed',
    '프리랜서가 금액에 동의했습니다',
    '계약서를 확인하고 서명해 주세요.',
    '/contracts/' || v_id,
    'amount-agreed:' || v_id
  );
  return v_id;
end;
$$;

create function public.decline_contract_amount(p_application_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_project public.projects%rowtype;
  v_app public.applications%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not public.ai_contract_member_is_active() then
    raise exception 'NOT_ACTIVE' using errcode = '42501';
  end if;

  select project_id into v_project_id
  from public.applications
  where id = p_application_id and deleted_at is null;
  if v_project_id is null then
    raise exception 'APPLICATION_NOT_FOUND';
  end if;

  select * into v_project from public.projects where id = v_project_id for update;
  if not found or v_project.deleted_at is not null then
    raise exception 'PROJECT_NOT_FOUND';
  end if;

  select * into v_app
  from public.applications
  where id = p_application_id and deleted_at is null
  for update;
  if not found then
    raise exception 'APPLICATION_NOT_FOUND';
  end if;
  if v_app.freelancer_id is distinct from (select auth.uid())
     or not exists (
       select 1 from public.profiles
       where id = (select auth.uid()) and role = 'freelancer' and deleted_at is null
     ) then
    raise exception 'NOT_THE_FREELANCER' using errcode = '42501';
  end if;

  if v_app.status = 'rejected' and v_app.reject_reason = 'negotiation_failed'
     and v_project.status = 'recruiting' then
    return v_app.id;
  end if;
  if exists (
    select 1 from public.contracts
    where application_id = v_app.id and deleted_at is null
  ) then
    raise exception 'CONTRACT_ALREADY_CREATED';
  end if;
  if v_project.status is distinct from 'contract_pending' then
    raise exception 'PROJECT_NOT_IN_CONTRACT';
  end if;
  if v_app.status is distinct from 'accepted' then
    raise exception 'APPLICATION_NOT_ACCEPTED';
  end if;

  -- 선정된 이 지원만 거절한다. auto, manual, closed 로 거절된 다른 지원은 그대로 둔다.
  update public.applications
     set status = 'rejected',
         reject_reason = 'negotiation_failed',
         updated_at = now()
   where id = v_app.id;

  update public.projects
     set status = 'recruiting'
   where id = v_project.id;

  perform public.create_notification(
    v_project.client_id,
    'amount_declined',
    '금액 합의가 이루어지지 않았습니다',
    '프로젝트가 다시 모집 중입니다.',
    '/projects/' || v_project.id || '/applicants',
    'amount-declined:' || v_app.id
  );
  return v_app.id;
end;
$$;

create function public.sign_contract(p_contract_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_contract public.contracts%rowtype;
  v_uid uuid;
  v_client_signed timestamptz;
  v_freelancer_signed timestamptz;
  v_status text;
begin
  v_uid := (select auth.uid());
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not public.ai_contract_member_is_active() then
    raise exception 'NOT_ACTIVE' using errcode = '42501';
  end if;

  select project_id into v_project_id
  from public.contracts
  where id = p_contract_id and deleted_at is null;
  if v_project_id is null then
    raise exception 'CONTRACT_NOT_FOUND';
  end if;

  perform 1 from public.projects where id = v_project_id for update;

  select * into v_contract
  from public.contracts
  where id = p_contract_id and deleted_at is null
  for update;
  if not found then
    raise exception 'CONTRACT_NOT_FOUND';
  end if;
  if v_uid is distinct from v_contract.client_id
     and v_uid is distinct from v_contract.freelancer_id then
    raise exception 'NOT_A_PARTY' using errcode = '42501';
  end if;
  if v_contract.status = 'signed' then
    return v_contract.id;
  end if;
  if v_contract.status is distinct from 'signing' then
    raise exception 'CONTRACT_NOT_SIGNING';
  end if;

  v_client_signed := v_contract.client_signed_at;
  v_freelancer_signed := v_contract.freelancer_signed_at;
  if v_uid = v_contract.client_id then
    if v_client_signed is not null then
      return v_contract.id;
    end if;
    v_client_signed := now();
  else
    if v_freelancer_signed is not null then
      return v_contract.id;
    end if;
    v_freelancer_signed := now();
  end if;

  v_status := case
    when v_client_signed is not null and v_freelancer_signed is not null then 'signed'
    else 'signing'
  end;

  update public.contracts
     set client_signed_at = v_client_signed,
         freelancer_signed_at = v_freelancer_signed,
         status = v_status
   where id = v_contract.id;

  if v_contract.status is distinct from 'signed' and v_status = 'signed' then
    perform public.create_notification(
      v_contract.client_id,
      'contract_signed',
      '계약이 체결되었습니다',
      '양쪽 서명이 끝났습니다. 결제 화면에서 대금을 넣을 수 있습니다.',
      '/contracts/' || v_contract.id,
      'contract-signed:' || v_contract.id || ':client'
    );
    perform public.create_notification(
      v_contract.freelancer_id,
      'contract_signed',
      '계약이 체결되었습니다',
      '양쪽 서명이 끝났습니다. 의뢰인이 결제한 뒤 작업이 시작됩니다.',
      '/contracts/' || v_contract.id,
      'contract-signed:' || v_contract.id || ':freelancer'
    );
  end if;
  return v_contract.id;
end;
$$;

comment on function public.agree_contract_amount(uuid) is
  '선정된 프리랜서가 수락 금액에 동의하면 서명 중 계약을 만든다. 금액은 applications.accepted_agreed_amount 를 쓴다.';
comment on function public.decline_contract_amount(uuid) is
  '선정된 프리랜서가 거부하면 그 지원만 negotiation_failed 로 거절하고 프로젝트를 recruiting 으로 되돌린다.';
comment on function public.sign_contract(uuid) is
  '계약 당사자가 한 번씩 서명한다. 둘 다 서명하면 signed 가 된다.';

revoke all on function public.agree_contract_amount(uuid) from PUBLIC, anon, authenticated;
revoke all on function public.decline_contract_amount(uuid) from PUBLIC, anon, authenticated;
revoke all on function public.sign_contract(uuid) from PUBLIC, anon, authenticated;
grant execute on function public.agree_contract_amount(uuid) to authenticated;
grant execute on function public.decline_contract_amount(uuid) to authenticated;
grant execute on function public.sign_contract(uuid) to authenticated;

commit;

-- 5번 담당. 0500 다음에 실행합니다.
-- 토스 웹훅이 같은 승인 이벤트를 다시 보내도 paid 를 되돌리거나 다른 키로 덮지 않습니다.
-- 브라우저 세션이 없는 서버만 호출합니다.

begin;

create function public.sync_payment_from_toss(
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
  if v_payment.amount is distinct from p_amount then
    raise exception 'AMOUNT_MISMATCH';
  end if;

  if v_payment.status in ('paid', 'paid_out') then
    if v_payment.payment_key is distinct from p_payment_key then
      raise exception 'PAYMENT_KEY_CONFLICT';
    end if;
    return v_payment.id;
  end if;

  if v_payment.status is distinct from 'ready' then
    raise exception 'PAYMENT_NOT_READY';
  end if;

  select * into v_contract
  from public.contracts
  where id = v_payment.contract_id
  for update;

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

revoke all on function public.sync_payment_from_toss(text, text, bigint) from PUBLIC, anon, authenticated;
grant execute on function public.sync_payment_from_toss(text, text, bigint) to service_role;

commit;

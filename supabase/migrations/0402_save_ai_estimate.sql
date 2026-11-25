-- 0402_save_ai_estimate.sql  (담당: 4번)
-- 0400 다음에 실행합니다. 0401과 순서는 상관없습니다.
-- 브라우저가 ai_estimates에 직접 넣지 못하게 0400에서 막아 두었습니다.
-- 이 함수만 참고 견적을 추가합니다. 칸이 빠지거나 금액이 이상하면 한 줄도 넣지 않습니다.

begin;

create or replace function public.save_ai_estimate(
  p_project_id uuid,
  p_items jsonb,
  p_total_amount bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_owner uuid;
  v_item jsonb;
  v_price bigint;
  v_sum bigint := 0;
  v_count integer;
  v_text text;
  v_price_text text;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.ai_contract_member_is_active() then
    raise exception 'NOT_ACTIVE' using errcode = '42501';
  end if;

  select p.client_id into v_owner
  from public.projects p
  where p.id = p_project_id
    and p.deleted_at is null
  for update;

  if v_owner is null then
    raise exception 'PROJECT_NOT_FOUND' using errcode = '42501';
  end if;
  if v_owner is distinct from (select auth.uid()) then
    raise exception 'CLIENT_MISMATCH' using errcode = '42501';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'ESTIMATE_INVALID' using errcode = '22023';
  end if;

  v_count := jsonb_array_length(p_items);
  if v_count < 1 or v_count > 12 then
    raise exception 'ESTIMATE_INVALID' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or jsonb_typeof(v_item->'name') is distinct from 'string'
       or jsonb_typeof(v_item->'description') is distinct from 'string'
       or jsonb_typeof(v_item->'basis') is distinct from 'string'
       or jsonb_typeof(v_item->'unit_price') is distinct from 'number' then
      raise exception 'ESTIMATE_INVALID' using errcode = '22023';
    end if;

    v_text := btrim(v_item->>'name');
    if v_text is null or char_length(v_text) < 1 or char_length(v_text) > 80 then
      raise exception 'ESTIMATE_INVALID' using errcode = '22023';
    end if;
    v_text := btrim(v_item->>'description');
    if v_text is null or char_length(v_text) < 1 or char_length(v_text) > 400 then
      raise exception 'ESTIMATE_INVALID' using errcode = '22023';
    end if;
    v_text := btrim(v_item->>'basis');
    if v_text is null or char_length(v_text) < 1 or char_length(v_text) > 300 then
      raise exception 'ESTIMATE_INVALID' using errcode = '22023';
    end if;

    v_price_text := v_item->>'unit_price';
    if v_price_text is null
       or v_price_text !~ '^[0-9]+(\.0+)?$'
       or char_length(split_part(v_price_text, '.', 1)) > 12 then
      raise exception 'ESTIMATE_INVALID' using errcode = '22023';
    end if;
    v_price := trunc(v_price_text::numeric)::bigint;
    if v_price < 10000 or v_price > 500000000 then
      raise exception 'ESTIMATE_INVALID' using errcode = '22023';
    end if;
    v_sum := v_sum + v_price;
  end loop;

  if p_total_amount is null
     or p_total_amount <> v_sum
     or p_total_amount < 10000
     or p_total_amount > 999999999999 then
    raise exception 'ESTIMATE_INVALID' using errcode = '22023';
  end if;

  insert into public.ai_estimates (project_id, client_id, items, total_amount)
  values (p_project_id, v_owner, p_items, p_total_amount)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.save_ai_estimate(uuid, jsonb, bigint) is
  '의뢰인 본인만 참고 견적을 추가한다. 칸이 빠지거나 금액이 이상하면 저장하지 않는다. 계약 금액은 바꾸지 않는다.';

revoke all on function public.save_ai_estimate(uuid, jsonb, bigint) from PUBLIC, anon, authenticated;
grant execute on function public.save_ai_estimate(uuid, jsonb, bigint) to authenticated;

commit;

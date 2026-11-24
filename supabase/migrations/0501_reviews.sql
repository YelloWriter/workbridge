-- 5번 담당. 0500 결제 다음에 실행합니다.
-- 리뷰는 누구나 읽고, 완료된 계약의 당사자만 상대방에게 한 번 씁니다. 수정은 없습니다.

begin;

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id),
  reviewer_id uuid not null references public.profiles (id),
  reviewee_id uuid not null references public.profiles (id),
  rating integer not null check (rating between 1 and 5),
  content text not null check (char_length(btrim(content)) between 1 and 1000),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (contract_id, reviewer_id),
  check (reviewer_id <> reviewee_id),
  check (cardinality(tags) <= 5),
  check (
    tags <@ array['소통', '일정', '품질', '전문성', '재계약']::text[]
  )
);

create index reviews_reviewee_idx
  on public.reviews (reviewee_id, created_at desc)
  where deleted_at is null;

comment on table public.reviews is
  '완료 계약의 상호 리뷰. 한 계약에 한 사람당 한 번. 수정 없음. 5번 담당.';

alter table public.reviews enable row level security;

create policy reviews_select_public
  on public.reviews
  for select
  to anon, authenticated
  using (deleted_at is null);

revoke all on table public.reviews from anon, authenticated, service_role;
grant select on table public.reviews to anon, authenticated;
grant select, insert on table public.reviews to service_role;

create view public.review_summaries
with (security_invoker = true)
as
select
  reviewee_id,
  round(avg(rating)::numeric, 2) as average_rating,
  count(*)::integer as review_count
from public.reviews
where deleted_at is null
group by reviewee_id;

grant select on public.review_summaries to anon, authenticated;

create function public.create_review(
  p_contract_id uuid,
  p_rating integer,
  p_content text,
  p_tags text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contract record;
  v_project_status text;
  v_reviewee uuid;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'INVALID_RATING';
  end if;
  if p_content is null or char_length(btrim(p_content)) not between 1 and 1000 then
    raise exception 'INVALID_CONTENT';
  end if;
  if p_tags is null then
    p_tags := '{}';
  end if;
  if cardinality(p_tags) > 5
    or not (p_tags <@ array['소통', '일정', '품질', '전문성', '재계약']::text[]) then
    raise exception 'INVALID_TAGS';
  end if;

  select * into v_contract
  from public.contracts
  where id = p_contract_id
  for share;

  if not found or v_contract.deleted_at is not null then
    raise exception 'CONTRACT_NOT_FOUND';
  end if;
  if auth.uid() is distinct from v_contract.client_id
    and auth.uid() is distinct from v_contract.freelancer_id then
    raise exception 'PARTY_REQUIRED' using errcode = '42501';
  end if;

  if auth.uid() = v_contract.client_id then
    v_reviewee := v_contract.freelancer_id;
  else
    v_reviewee := v_contract.client_id;
  end if;

  select status into v_project_status
  from public.projects
  where id = v_contract.project_id
    and deleted_at is null;

  if v_project_status is distinct from 'completed' then
    raise exception 'PROJECT_NOT_COMPLETED';
  end if;

  if exists (
    select 1 from public.reviews r
    where r.contract_id = p_contract_id
      and r.reviewer_id = auth.uid()
      and r.deleted_at is null
  ) then
    raise exception 'REVIEW_ALREADY_EXISTS';
  end if;

  insert into public.reviews (
    contract_id, reviewer_id, reviewee_id, rating, content, tags
  )
  values (
    p_contract_id, auth.uid(), v_reviewee, p_rating, btrim(p_content), p_tags
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_review(uuid, integer, text, text[]) from PUBLIC, anon, authenticated;
grant execute on function public.create_review(uuid, integer, text, text[]) to authenticated, service_role;

commit;

begin;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  type text not null check (type in (
    'application_submitted', 'application_accepted', 'application_auto_rejected',
    'application_rejected', 'project_closed', 'amount_proposed', 'amount_agreed',
    'amount_declined', 'contract_signed', 'payment_completed', 'delivery_requested',
    'delivery_approved', 'review_requested'
  )),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  body text not null check (char_length(body) <= 2000),
  link text not null check (
    char_length(link) <= 1000 and link ~ '^/[^/]' and
    link !~ '[[:cntrl:]]' and position(chr(92) in link) = 0
  ),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  event_key text,
  unique(user_id, event_key)
);
create index notifications_user_created on public.notifications(user_id, created_at desc)
  where deleted_at is null;
create index notifications_user_unread on public.notifications(user_id)
  where read_at is null and deleted_at is null;
alter table public.notifications enable row level security;
create policy notifications_recipient_read on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) and deleted_at is null);
create policy notifications_recipient_read_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid()) and deleted_at is null)
  with check (user_id = (select auth.uid()) and deleted_at is null);
revoke all on public.notifications from anon, authenticated, service_role;
grant select on public.notifications to authenticated;
grant update(read_at) on public.notifications to authenticated;
grant select, insert, update on public.notifications to service_role;

-- Single notification insertion primitive. Only trusted server code and the
-- transaction RPCs below may use it; authenticated users cannot forge events.
create function public.create_notification(
  p_user_id uuid, p_type text, p_title text, p_body text, p_link text,
  p_event_key text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.notifications(user_id, type, title, body, link, event_key)
  values(p_user_id, p_type, p_title, p_body, p_link, p_event_key)
  on conflict (user_id, event_key) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.notifications
      where user_id = p_user_id and event_key = p_event_key;
  end if;
  return v_id;
end;
$$;
revoke all on function public.create_notification(uuid,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.create_notification(uuid,text,text,text,text,text) to service_role;

create function public.submit_application(
  p_project_id uuid, p_cover_letter text, p_proposed_amount numeric, p_proposed_days integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_project public.projects%rowtype; v_profile public.profiles%rowtype; v_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  -- All project transitions lock the project first, then application rows.
  select * into v_project from public.projects where id = p_project_id for update;
  if not found or v_project.deleted_at is not null then raise exception 'PROJECT_NOT_FOUND'; end if;
  select * into v_profile from public.profiles where id = auth.uid() for share;
  if not found or v_profile.role <> 'freelancer' or v_project.client_id = auth.uid() then
    raise exception 'FREELANCER_REQUIRED' using errcode = '42501';
  end if;
  if nullif(btrim(v_profile.name), '') is null or nullif(btrim(v_profile.bio), '') is null
    or nullif(btrim(v_profile.category), '') is null or coalesce(cardinality(v_profile.skills), 0) = 0 then
    raise exception 'PROFILE_INCOMPLETE';
  end if;
  if v_project.status <> 'recruiting' or v_project.recruit_start_at is null or v_project.recruit_end_at is null
    or v_project.recruit_start_at > now() or v_project.recruit_end_at <= now() then raise exception 'RECRUITMENT_CLOSED'; end if;
  if p_cover_letter is null or char_length(btrim(p_cover_letter)) not between 1 and 5000
    or p_proposed_amount is null or p_proposed_amount not between 1 and 999999999999
    or p_proposed_amount <> trunc(p_proposed_amount)
    or p_proposed_days is null or p_proposed_days not between 1 and 3650 then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;
  if exists(select 1 from public.applications where project_id = p_project_id and freelancer_id = auth.uid()) then
    raise exception 'ALREADY_APPLIED' using errcode = '23505';
  end if;
  insert into public.applications(project_id, freelancer_id, cover_letter, proposed_amount, proposed_days)
    values(p_project_id, auth.uid(), btrim(p_cover_letter), p_proposed_amount, p_proposed_days)
    returning id into v_id;
  perform public.create_notification(v_project.client_id, 'application_submitted', '새 지원서가 도착했습니다',
    '프로젝트 지원서를 확인해 주세요.', '/projects/' || p_project_id || '/applicants', 'submitted:' || v_id);
  return v_id;
end;
$$;

create function public.accept_application(p_application_id uuid, p_agreed_amount numeric)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_project_id uuid; v_project public.projects%rowtype; v_app public.applications%rowtype; v_other record;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_agreed_amount is null or p_agreed_amount not between 1 and 999999999999
    or p_agreed_amount <> trunc(p_agreed_amount) then raise exception 'INVALID_INPUT' using errcode = '22023'; end if;
  select project_id into v_project_id from public.applications where id = p_application_id and deleted_at is null;
  select * into v_project from public.projects where id = v_project_id for update;
  if not found or v_project.deleted_at is not null then raise exception 'PROJECT_NOT_FOUND'; end if;
  if v_project.client_id <> auth.uid() then raise exception 'OWNER_REQUIRED' using errcode = '42501'; end if;
  select * into v_app from public.applications where id = p_application_id and deleted_at is null for update;
  if not found then raise exception 'APPLICATION_NOT_FOUND'; end if;
  -- Retry of the exact same request does not send duplicate notifications.
  if v_app.status = 'accepted' and v_project.status = 'contract_pending'
    and v_app.accepted_agreed_amount = p_agreed_amount then return v_app.id; end if;
  if v_app.status <> 'pending' then raise exception 'APPLICATION_ALREADY_DECIDED'; end if;
  if v_project.status <> 'recruiting' then raise exception 'RECRUITMENT_CLOSED'; end if;
  update public.applications set status = 'accepted', accepted_agreed_amount = p_agreed_amount,
    accepted_at = now(), updated_at = now() where id = v_app.id;
  for v_other in
    update public.applications set status = 'rejected', reject_reason = 'auto', updated_at = now()
      where project_id = v_project_id and status = 'pending' and deleted_at is null
      returning id, freelancer_id
  loop
    perform public.create_notification(v_other.freelancer_id, 'application_auto_rejected', '지원 결과가 결정되었습니다',
      '다른 지원자가 선정되어 이번 지원이 종료되었습니다.', '/me/applications', 'auto:' || v_other.id);
  end loop;
  update public.projects set status = 'contract_pending' where id = v_project_id;
  perform public.create_notification(v_app.freelancer_id, 'application_accepted', '지원이 수락되었습니다',
    '내 지원 현황에서 결과와 제안 금액을 확인해 주세요.', '/me/applications', 'accepted:' || v_app.id);
  perform public.create_notification(v_project.client_id, 'application_accepted', '지원자 선정이 완료되었습니다',
    '선정한 지원자와 계약을 준비해 주세요.', '/projects/' || v_project_id || '/applicants', 'accepted-owner:' || v_app.id);
  return v_app.id;
end;
$$;

create function public.reject_application(p_application_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_project_id uuid; v_project public.projects%rowtype; v_app public.applications%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select project_id into v_project_id from public.applications where id = p_application_id and deleted_at is null;
  select * into v_project from public.projects where id = v_project_id for update;
  if not found or v_project.deleted_at is not null then raise exception 'PROJECT_NOT_FOUND'; end if;
  if v_project.client_id <> auth.uid() then raise exception 'OWNER_REQUIRED' using errcode = '42501'; end if;
  select * into v_app from public.applications where id = p_application_id and deleted_at is null for update;
  if not found then raise exception 'APPLICATION_NOT_FOUND'; end if;
  if v_app.status = 'rejected' and v_app.reject_reason = 'manual' then return v_app.id; end if;
  if v_app.status <> 'pending' then raise exception 'APPLICATION_ALREADY_DECIDED'; end if;
  if v_project.status <> 'recruiting' then raise exception 'RECRUITMENT_CLOSED'; end if;
  update public.applications set status = 'rejected', reject_reason = 'manual', updated_at = now() where id = v_app.id;
  perform public.create_notification(v_app.freelancer_id, 'application_rejected', '지원 결과를 확인해 주세요',
    '의뢰인이 이번 지원을 거절했습니다.', '/me/applications', 'manual:' || v_app.id);
  return v_app.id;
end;
$$;

-- Member 2 MUST call this instead of updating projects.status first.
-- For scheduled expiry, use a server-only service-role client; the RPC also
-- enforces recruit_end_at for service-role calls, so it cannot close early.
create function public.close_project_applications(p_project_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_project public.projects%rowtype; v_app record; v_count integer;
begin
  select * into v_project from public.projects where id = p_project_id for update;
  if not found or v_project.deleted_at is not null then raise exception 'PROJECT_NOT_FOUND'; end if;
  if auth.role() = 'service_role' then
    if v_project.recruit_end_at is null or v_project.recruit_end_at > now() then
      raise exception 'NOT_DUE';
    end if;
  elsif auth.uid() is null or v_project.client_id <> auth.uid() then
    raise exception 'OWNER_REQUIRED' using errcode = '42501';
  end if;
  if v_project.status = 'closed' then return 0; end if;
  if v_project.status <> 'recruiting' then raise exception 'INVALID_PROJECT_STATUS'; end if;
  update public.applications set status = 'rejected', reject_reason = 'closed', updated_at = now()
    where project_id = p_project_id and status = 'pending' and deleted_at is null;
  get diagnostics v_count = row_count;
  update public.projects set status = 'closed' where id = p_project_id;
  -- Notify everyone who applied, retaining previously decided rejection reasons.
  for v_app in select id, freelancer_id from public.applications
    where project_id = p_project_id and deleted_at is null
  loop
    perform public.create_notification(v_app.freelancer_id, 'project_closed', '프로젝트 모집이 마감되었습니다',
      '내 지원 현황에서 지원 결과를 확인해 주세요.', '/me/applications', 'closed:' || v_app.id);
  end loop;
  return v_count;
end;
$$;

revoke all on function public.submit_application(uuid,text,numeric,integer) from public, anon, authenticated;
revoke all on function public.accept_application(uuid,numeric) from public, anon, authenticated;
revoke all on function public.reject_application(uuid) from public, anon, authenticated;
revoke all on function public.close_project_applications(uuid) from public, anon, authenticated;
grant execute on function public.submit_application(uuid,text,numeric,integer) to authenticated;
grant execute on function public.accept_application(uuid,numeric) to authenticated;
grant execute on function public.reject_application(uuid) to authenticated;
grant execute on function public.close_project_applications(uuid) to authenticated, service_role;

-- Touch only member 3's table. Local PostgreSQL without Supabase skips this.
do $$
begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists(select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

commit;

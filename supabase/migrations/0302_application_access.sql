-- Member 3: apply after 0301; compatible with 0100's nullable role and soft deletion.
-- Existing migrations may already be applied, so update functions here.
begin;

create function public.application_member_is_active()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles
    where id = (select auth.uid()) and deleted_at is null);
$$;
revoke all on function public.application_member_is_active() from public, anon, authenticated;
grant execute on function public.application_member_is_active() to authenticated;

alter policy applications_participants_read on public.applications
  using (deleted_at is null and public.application_member_is_active() and
    (freelancer_id = (select auth.uid()) or public.application_project_owned_by_me(project_id)));
alter policy notifications_recipient_read on public.notifications
  using (user_id = (select auth.uid()) and deleted_at is null and public.application_member_is_active());
alter policy notifications_recipient_read_update on public.notifications
  using (user_id = (select auth.uid()) and deleted_at is null and public.application_member_is_active())
  with check (user_id = (select auth.uid()) and deleted_at is null and public.application_member_is_active());

create or replace function public.submit_application(
  p_project_id uuid, p_cover_letter text, p_proposed_amount numeric, p_proposed_days integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_project public.projects%rowtype; v_profile public.profiles%rowtype; v_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  -- All project transitions lock the project first, then application rows.
  select * into v_project from public.projects where id = p_project_id for update;
  if not found or v_project.deleted_at is not null then raise exception 'PROJECT_NOT_FOUND'; end if;
  select * into v_profile from public.profiles where id = auth.uid() for share;
  if not found or v_profile.deleted_at is not null or v_profile.role is distinct from 'freelancer'
    or v_project.client_id = auth.uid() then
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

create or replace function public.accept_application(p_application_id uuid, p_agreed_amount numeric)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_project_id uuid; v_project public.projects%rowtype; v_app public.applications%rowtype; v_other record;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_agreed_amount is null or p_agreed_amount not between 1 and 999999999999
    or p_agreed_amount <> trunc(p_agreed_amount) then raise exception 'INVALID_INPUT' using errcode = '22023'; end if;
  select project_id into v_project_id from public.applications where id = p_application_id and deleted_at is null;
  select * into v_project from public.projects where id = v_project_id for update;
  if not found or v_project.deleted_at is not null then raise exception 'PROJECT_NOT_FOUND'; end if;
  if v_project.client_id <> auth.uid() or not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'client' and deleted_at is null
  ) then raise exception 'OWNER_REQUIRED' using errcode = '42501'; end if;
  select * into v_app from public.applications where id = p_application_id and deleted_at is null for update;
  if not found then raise exception 'APPLICATION_NOT_FOUND'; end if;
  -- Retry of the exact same request does not send duplicate notifications.
  if v_app.status = 'accepted' and v_project.status = 'contract_pending'
    and v_app.accepted_agreed_amount = p_agreed_amount then return v_app.id; end if;
  if v_app.status <> 'pending' then raise exception 'APPLICATION_ALREADY_DECIDED'; end if;
  if not exists (select 1 from public.profiles where id = v_app.freelancer_id
    and role = 'freelancer' and deleted_at is null) then raise exception 'APPLICANT_UNAVAILABLE'; end if;
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

create or replace function public.reject_application(p_application_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_project_id uuid; v_project public.projects%rowtype; v_app public.applications%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select project_id into v_project_id from public.applications where id = p_application_id and deleted_at is null;
  select * into v_project from public.projects where id = v_project_id for update;
  if not found or v_project.deleted_at is not null then raise exception 'PROJECT_NOT_FOUND'; end if;
  if v_project.client_id <> auth.uid() or not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'client' and deleted_at is null
  ) then raise exception 'OWNER_REQUIRED' using errcode = '42501'; end if;
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
create or replace function public.close_project_applications(p_project_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_project public.projects%rowtype; v_app record; v_count integer;
begin
  select * into v_project from public.projects where id = p_project_id for update;
  if not found or v_project.deleted_at is not null then raise exception 'PROJECT_NOT_FOUND'; end if;
  if auth.role() = 'service_role' then
    if v_project.recruit_end_at is null or v_project.recruit_end_at > now() then
      raise exception 'NOT_DUE';
    end if;
  elsif auth.uid() is null or v_project.client_id <> auth.uid() or not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'client' and deleted_at is null
  ) then
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

commit;

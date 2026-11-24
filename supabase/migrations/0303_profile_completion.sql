-- Member 3: align with member 1 profile form (name required; other fields optional).
begin;

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
  if nullif(btrim(v_profile.name), '') is null then
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

commit;

-- 0203_project_status_guard.sql  (담당: 2번)
-- 0202 다음에 실행합니다. (0202 의 project_has_applicants 함수를 씁니다)
--
-- 막는 일: 의뢰인이 화면을 거치지 않고 DB 에 직접 요청해서 프로젝트 status 를 바꾸는 것.
--   예) 결제 없이 'in_progress'(작업 중)·'completed'(완료)로 바꾸기, 지원 거절·알림 없이 'closed' 로 바꾸기
--
-- 직접 요청으로 허용되는 것: 'scheduled'(모집 예정) ↔ 'recruiting'(모집 중) 뿐.
--   (등록·수정할 때 시작일에 따라 정해지는 값이라 2번 화면이 직접 바꿉니다)
--   단, 지원자가 있으면 'recruiting' → 'scheduled' 로 되돌릴 수 없습니다.
-- 그 밖의 모든 상태 변경은 각 담당의 DB 함수(security definer)로만 합니다.
--   3번 accept_application(→contract_pending), close_project_applications(→closed)
--   5번 mark_payment_paid(→in_progress), request_delivery(→delivered), approve_delivery(→completed)
--   4번 합의 결렬(→recruiting)·서명 함수 (4번 SQL 이 만들어지면 같은 방식이어야 합니다)
--
-- 구분 방법: 함수 안에서 실행되는 변경은 함수 주인(postgres) 권한으로 실행되고,
--   브라우저에서 직접 보낸 요청은 authenticated 권한으로 실행됩니다.
--   서버 전용 서비스 키(service_role)와 대시보드 SQL Editor(postgres)는 막지 않습니다.

create or replace function public.projects_guard_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and current_user in ('authenticated', 'anon') then

    if not (old.status in ('scheduled', 'recruiting')
            and new.status in ('scheduled', 'recruiting')) then
      raise exception 'STATUS_CHANGE_NOT_ALLOWED: 프로젝트 상태는 직접 바꿀 수 없습니다. 모집 마감·수락·결제·납품·완료는 해당 기능으로만 바뀝니다.'
        using errcode = '42501';
    end if;

    if new.status = 'scheduled' and public.project_has_applicants(old.id) then
      raise exception 'HAS_APPLICANTS: 지원자가 있는 프로젝트는 모집 예정으로 되돌릴 수 없습니다.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists projects_guard_status on public.projects;
create trigger projects_guard_status
  before update on public.projects
  for each row execute function public.projects_guard_status();

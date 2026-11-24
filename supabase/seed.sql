-- 시연 계정과 프로젝트. 0201_bookmarks.sql 다음에 한 번만 실행합니다.
-- 이미 같은 이메일이 있으면 넣지 않습니다.
-- 비밀번호는 수업 시연용 Workbridge-demo-1124 입니다.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, phone_change_token,
  email_change_confirm_status, is_sso_user, is_anonymous
)
select
  '00000000-0000-0000-0000-000000000000',
  account.id,
  'authenticated',
  'authenticated',
  account.email,
  extensions.crypt('Workbridge-demo-1124', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('name', account.display_name),
  now(),
  now(),
  '', '', '', '', '', '', '',
  0,
  false,
  false
from (
  values
    ('11111111-1111-4111-8111-111111111111'::uuid, 'client.demo@mailinator.com', '한지민'),
    ('22222222-2222-4222-8222-222222222222'::uuid, 'freelancer.demo@mailinator.com', '김서준')
) as account(id, email, display_name)
where not exists (select 1 from auth.users u where u.email = account.email);

insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
select
  account.id::text,
  account.id,
  jsonb_build_object('sub', account.id::text, 'email', account.email),
  'email',
  now(),
  now()
from (
  values
    ('11111111-1111-4111-8111-111111111111'::uuid, 'client.demo@mailinator.com'),
    ('22222222-2222-4222-8222-222222222222'::uuid, 'freelancer.demo@mailinator.com')
) as account(id, email)
where not exists (
  select 1 from auth.identities i where i.user_id = account.id and i.provider = 'email'
);

update public.profiles set
  role = 'client',
  name = '한지민',
  company_name = '한가람',
  business_field = '쇼핑',
  website = 'https://example.com'
where id = '11111111-1111-4111-8111-111111111111';

update public.profiles set
  role = 'freelancer',
  name = '김서준',
  category = '웹 개발',
  skills = array['TypeScript', 'React', 'SQL'],
  career_years = 5,
  hourly_rate = 50000,
  portfolio_url = 'https://example.com/portfolio',
  bio = '웹과 앱을 만드는 프리랜서입니다.'
where id = '22222222-2222-4222-8222-222222222222';

insert into public.projects (
  client_id, title, description, category, skills, budget, recruit_start_at, recruit_end_at, status
)
select
  '11111111-1111-4111-8111-111111111111',
  project.title,
  project.description,
  project.category,
  project.skills,
  project.budget,
  project.recruit_start_at,
  project.recruit_end_at,
  project.status
from (
  values
    ('쇼핑몰 상품 목록', '상품을 검색하고 장바구니에 담는 웹 화면을 만듭니다.', '웹 개발', array['React', 'SQL'], 5000000::bigint, now(), now() + interval '21 days', 'recruiting'),
    ('매장 예약 앱', '손님이 시술을 예약하고 알림을 받는 앱입니다.', '앱 개발', array['React', 'TypeScript'], 8000000::bigint, now(), now() + interval '30 days', 'recruiting'),
    ('판매 수치 대시보드', '일별 판매 금액을 한 화면에서 보는 화면입니다.', '데이터·AI', array['Python', 'SQL'], 3000000::bigint, now() + interval '7 days', now() + interval '40 days', 'scheduled')
) as project(title, description, category, skills, budget, recruit_start_at, recruit_end_at, status)
where not exists (
  select 1 from public.projects existing
  where existing.client_id = '11111111-1111-4111-8111-111111111111'
    and existing.title = project.title
    and existing.deleted_at is null
);

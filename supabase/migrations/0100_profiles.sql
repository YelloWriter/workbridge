-- 1번 담당. Supabase 대시보드 → SQL Editor 에 이 파일 전체를 붙여 넣고 Run 합니다.
-- 테이블 이름과 role 값은 docs/TEAM.md 2장과 같습니다.
-- 정한 이유: docs/decisions/2026-11-23-profiles.md

-- ---------------------------------------------------------------------------
-- profiles: auth.users 한 명당 한 행
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text,
  name text,
  email text,
  avatar_url text,
  bio text,
  company_name text,
  business_field text,
  website text,
  category text,
  skills text[] not null default '{}',
  career_years integer,
  hourly_rate integer,
  portfolio_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint profiles_role_check
    check (role is null or role in ('client', 'freelancer')),
  constraint profiles_name_len
    check (name is null or char_length(btrim(name)) between 1 and 40),
  constraint profiles_bio_len
    check (bio is null or char_length(bio) <= 1000),
  constraint profiles_career_years_check
    check (career_years is null or career_years >= 0),
  constraint profiles_hourly_rate_check
    check (hourly_rate is null or hourly_rate >= 0),
  constraint profiles_skills_count
    check (cardinality(skills) <= 20),
  constraint profiles_website_len
    check (website is null or char_length(website) <= 300),
  constraint profiles_portfolio_url_len
    check (portfolio_url is null or char_length(portfolio_url) <= 300),
  constraint profiles_email_unique unique (email)
);

comment on table public.profiles is
  '회원 프로필. auth.users 와 1:1. 가입 트리거가 만들고, 본인만 수정한다.';

create index profiles_role_active_idx
  on public.profiles (role)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 가입하면 프로필 행을 만든다. 이메일 앞글자로 이름을 채우지 않는다.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    nullif(
      btrim(
        coalesce(
          new.raw_user_meta_data ->> 'name',
          new.raw_user_meta_data ->> 'full_name',
          ''
        )
      ),
      ''
    ),
    nullif(
      btrim(
        coalesce(
          new.raw_user_meta_data ->> 'avatar_url',
          new.raw_user_meta_data ->> 'picture',
          ''
        )
      ),
      ''
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- 로그인 이메일이 바뀌면 프로필 이메일도 맞춘다.
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles
      set email = new.email
      where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  execute function public.sync_profile_email();

-- 수정 시각은 화면이 아니라 여기서 찍는다.
create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_profiles_updated_at();

revoke all on function public.handle_new_user() from PUBLIC, anon, authenticated;
revoke all on function public.sync_profile_email() from PUBLIC, anon, authenticated;
revoke all on function public.set_profiles_updated_at() from PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS: 삭제되지 않은 행은 누구나 조회, 수정은 본인만.
-- 이메일은 칸 권한에서 빼서 브라우저 조회가 안 된다.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;

grant select (
  id,
  role,
  name,
  avatar_url,
  bio,
  company_name,
  business_field,
  website,
  category,
  skills,
  career_years,
  hourly_rate,
  portfolio_url,
  created_at,
  updated_at
) on table public.profiles to anon, authenticated;

grant update (
  role,
  name,
  avatar_url,
  bio,
  company_name,
  business_field,
  website,
  category,
  skills,
  career_years,
  hourly_rate,
  portfolio_url,
  deleted_at
) on table public.profiles to authenticated;

grant all on table public.profiles to service_role;

create policy profiles_select_public
  on public.profiles
  for select
  to anon, authenticated
  using (deleted_at is null or (select auth.uid()) = id);

create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- insert / delete 정책은 없다.
-- 행 추가는 handle_new_user 트리거만, 삭제는 deleted_at 만 사용한다.

-- ---------------------------------------------------------------------------
-- 프로필 이미지. 버킷은 공개 읽기, 파일 쓰기는 본인 폴더만.
-- 경로: avatars/{user id}/파일명
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avatars_insert_own on storage.objects;
drop policy if exists avatars_select_own on storage.objects;
drop policy if exists avatars_update_own on storage.objects;
drop policy if exists avatars_delete_own on storage.objects;

create policy avatars_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_select_own
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_update_own
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

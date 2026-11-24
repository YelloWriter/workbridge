-- Prerequisites: 0100 profiles and 0200 projects (UUID primary keys).
begin;

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  freelancer_id uuid not null references public.profiles(id),
  cover_letter text not null check (char_length(btrim(cover_letter)) between 1 and 5000),
  proposed_amount numeric(12,0) not null check (proposed_amount between 1 and 999999999999),
  proposed_days integer not null check (proposed_days between 1 and 3650),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  reject_reason text check (reject_reason in ('manual', 'auto', 'closed', 'negotiation_failed')),
  -- Handoff to member 4; no contracts table is created by member 3.
  accepted_agreed_amount numeric(12,0) check (accepted_agreed_amount between 1 and 999999999999),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (project_id, freelancer_id),
  check ((status = 'rejected') = (reject_reason is not null))
);

create unique index applications_one_accepted_per_project
  on public.applications(project_id) where status = 'accepted' and deleted_at is null;
create index applications_freelancer_created on public.applications(freelancer_id, created_at desc);
create index applications_project_status on public.applications(project_id, status);

-- This lookup deliberately bypasses projects' public-list RLS. An owner must
-- still be able to see applications after the project leaves 'recruiting'.
create function public.application_project_owned_by_me(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.projects p
    where p.id = p_project_id and p.client_id = (select auth.uid()));
$$;
revoke all on function public.application_project_owned_by_me(uuid) from public, anon, authenticated;
grant execute on function public.application_project_owned_by_me(uuid) to authenticated;

alter table public.applications enable row level security;
create policy applications_participants_read on public.applications for select to authenticated
  using (deleted_at is null and
    (freelancer_id = (select auth.uid()) or public.application_project_owned_by_me(project_id)));

-- Every write goes through an authorized RPC in 0301. No direct INSERT/UPDATE
-- policy allows a browser to choose a status or impersonate a freelancer.
revoke all on public.applications from anon, authenticated, service_role;
grant select on public.applications to authenticated;
grant select, insert, update on public.applications to service_role;

commit;

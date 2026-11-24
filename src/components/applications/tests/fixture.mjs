import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/** Only auth/storage infrastructure is stubbed. All application schemas,
 * triggers, grants, RLS and RPCs come from the repository's real migrations. */
export async function installTeamSchema(db) {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.role() returns text language sql stable as $$
      select current_setting('request.jwt.claim.role', true) $$;
    grant usage on schema auth, storage, public to anon, authenticated, service_role;
    grant execute on all functions in schema auth to anon, authenticated, service_role;
    -- Supabase's normal public-schema default grants; each migration restricts
    -- sensitive tables after creating them. No grants are added after migration.
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql immutable as $$
      select (string_to_array($1, '/'))[1:array_length(string_to_array($1, '/'), 1)-1] $$;
  `);
  for (const file of ["0100_profiles.sql", "0200_projects.sql", "0201_bookmarks.sql", "0300_applications.sql", "0301_notifications.sql", "0302_application_access.sql"]) {
    await db.exec(await readFile(resolve("supabase/migrations", file), "utf8"));
  }
}

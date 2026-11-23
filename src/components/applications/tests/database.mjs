// Run against an ephemeral PostgreSQL engine, never the shared Supabase project.
// WORKBRIDGE_PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node src/components/applications/tests/database.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const moduleUrl = process.env.WORKBRIDGE_PGLITE_MODULE
  ? pathToFileURL(resolve(process.env.WORKBRIDGE_PGLITE_MODULE)).href : "@electric-sql/pglite";
const { PGlite } = await import(moduleUrl);
const db = new PGlite();
let assertions = 0;
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); assertions++; };
const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
const client = "10000000-0000-0000-0000-000000000001";
const first = "10000000-0000-0000-0000-000000000002";
const second = "10000000-0000-0000-0000-000000000003";
const stranger = "10000000-0000-0000-0000-000000000004";
const incomplete = "10000000-0000-0000-0000-000000000005";
const p1 = "20000000-0000-0000-0000-000000000001";
const p2 = "20000000-0000-0000-0000-000000000002";
const p3 = "20000000-0000-0000-0000-000000000003";
const p4 = "20000000-0000-0000-0000-000000000004";
const p5 = "20000000-0000-0000-0000-000000000005";
const p6 = "20000000-0000-0000-0000-000000000006";
async function as(role, id, run) {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', $2, false)", [id ?? "", role]);
  try { return await run(); } finally { await db.exec("reset role"); }
}
async function rejected(run, expected) {
  await assert.rejects(run, error => expected.test(error.message));
  assertions++;
}
const submit = (project = p1, amount = 500000) => scalar("select public.submit_application($1, '프로젝트 제안', $2, 14)", [project, amount]);
const accept = (id, amount = 600000) => scalar("select public.accept_application($1, $2)", [id, amount]);
const close = (project) => scalar("select public.close_project_applications($1)", [project]);
try {
  // Minimal fixtures reproduce the TEAM.md contract. They do not replace the
  // real 0100/0200 migrations, which must also be tested once integrated.
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.role() returns text language sql stable as $$
      select current_setting('request.jwt.claim.role', true) $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on all functions in schema auth to anon, authenticated, service_role;
    create table public.profiles(id uuid primary key, role text not null, name text, bio text, category text, skills text[]);
    create table public.projects(id uuid primary key, client_id uuid references profiles(id), title text,
      status text not null, recruit_start_at timestamptz, recruit_end_at timestamptz, deleted_at timestamptz);
    alter table public.projects enable row level security;
    create policy projects_read on public.projects for select to authenticated
      using (status in ('scheduled', 'recruiting') or client_id = auth.uid());
    grant select on public.projects, public.profiles to authenticated;
  `);
  for (const file of ["0300_applications.sql", "0301_notifications.sql"]) {
    await db.exec(await readFile(resolve("supabase/migrations", file), "utf8"));
  }
  for (const [id, role] of [[client, "client"], [first, "freelancer"], [second, "freelancer"], [stranger, "freelancer"], [incomplete, "freelancer"]]) {
    await db.query("insert into profiles values ($1,$2,'이름',$3,'development',array['TypeScript'])", [id, role, id === incomplete ? "" : "자기소개"]);
  }
  for (const project of [p1, p2, p3, p4, p5, p6]) {
    await db.query("insert into projects values ($1,$2,'테스트 프로젝트','recruiting',now()-interval '1 day',now()+interval '1 day',null)", [project, client]);
  }
  await as("anon", null, async () => {
    await rejected(() => submit(), /permission denied/);
    await rejected(() => db.query("select * from applications"), /permission denied/);
    await rejected(() => db.query("select * from notifications"), /permission denied/);
  });
  await as("authenticated", client, () => rejected(() => submit(), /FREELANCER_REQUIRED/));
  await as("authenticated", incomplete, () => rejected(() => submit(), /PROFILE_INCOMPLETE/));
  await as("authenticated", first, () => rejected(() => submit(p1, 1.5), /INVALID_INPUT/));
  const a = await as("authenticated", first, () => submit());
  const b = await as("authenticated", second, () => submit());
  check(await scalar("select count(*)::int from notifications where type='application_submitted'"), 2, "submitted notifications");
  await as("authenticated", first, async () => {
    check(await scalar("select count(*)::int from applications"), 1, "only own application");
    await rejected(() => submit(), /ALREADY_APPLIED/);
    await rejected(() => accept(b), /OWNER_REQUIRED/);
    await rejected(() => db.query("update applications set status='accepted' where id=$1", [a]), /permission denied/);
    await rejected(() => db.query("select create_notification($1,'application_accepted','偽','x','/notifications',null)", [first]), /permission denied/);
    await rejected(() => close(p1), /OWNER_REQUIRED/);
  });
  await as("authenticated", stranger, async () => {
    check(await scalar("select count(*)::int from applications"), 0, "stranger cannot read applications");
    check(await scalar("select count(*)::int from notifications"), 0, "stranger cannot read notifications");
  });
  await as("authenticated", client, async () => {
    check(await scalar("select count(*)::int from applications"), 2, "owner reads both");
    await rejected(() => accept(a, 0), /INVALID_INPUT/);
    check(await accept(a), a, "accept returns selected ID");
    check(await accept(a), a, "accept retry succeeds");
    await rejected(() => accept(b), /APPLICATION_ALREADY_DECIDED/);
    check(await scalar("select count(*)::int from applications"), 2, "owner still reads after contract_pending");
  });
  check(await scalar("select status from projects where id=$1", [p1]), "contract_pending", "project transitions");
  check(await scalar("select status from applications where id=$1", [a]), "accepted", "accepted status");
  check(await scalar("select accepted_agreed_amount::int from applications where id=$1", [a]), 600000, "amount handoff saved");
  check(await scalar("select reject_reason from applications where id=$1", [b]), "auto", "other application auto rejected");
  check(await scalar("select count(*)::int from notifications where type='application_accepted'"), 2, "both sides notified once");
  check(await scalar("select count(*)::int from notifications where type='application_auto_rejected'"), 1, "automatic rejection once");
  await as("authenticated", first, async () => {
    const n = await scalar("select id from notifications limit 1");
    await db.query("update notifications set read_at=now() where id=$1", [n]);
    check(await scalar("select count(*)::int from notifications where read_at is not null"), 1, "recipient marks read");
    await rejected(() => db.query("update notifications set user_id=$1 where id=$2", [stranger, n]), /permission denied/);
    await rejected(() => db.query("update notifications set title='changed' where id=$1", [n]), /permission denied/);
    await rejected(() => db.query("delete from notifications where id=$1", [n]), /permission denied/);
    await db.query("update notifications set read_at=now() where user_id=$1", [client]);
  });
  check(await scalar("select count(*)::int from notifications where user_id=$1 and read_at is not null", [client]), 0, "cross-recipient update blocked");
  const c = await as("authenticated", first, () => submit(p2));
  const d = await as("authenticated", second, () => submit(p2));
  await as("authenticated", client, async () => {
    check(await scalar("select reject_application($1)", [c]), c, "manual reject returns ID");
    await scalar("select reject_application($1)", [c]);
    check(await close(p2), 1, "only pending rejected at close");
    check(await close(p2), 0, "close retry is harmless");
  });
  check(await scalar("select reject_reason from applications where id=$1", [c]), "manual", "manual reason retained");
  check(await scalar("select reject_reason from applications where id=$1", [d]), "closed", "pending gets closed reason");
  check(await scalar("select count(*)::int from notifications where type='project_closed'"), 2, "all applicants notified including manually rejected");
  check(await scalar("select count(*)::int from notifications where type='application_rejected'"), 1, "manual retry no duplicate");
  await as("service_role", null, () => rejected(() => close(p3), /NOT_DUE/));
  const e = await as("authenticated", first, () => submit(p3));
  await db.query("update projects set recruit_end_at=now()-interval '1 minute' where id=$1", [p3]);
  await as("authenticated", second, () => rejected(() => submit(p3), /RECRUITMENT_CLOSED/));
  check(await as("service_role", null, () => close(p3)), 1, "expiry server may close due project");
  check(await scalar("select reject_reason from applications where id=$1", [e]), "closed", "expiry rejects pending");

  // Force an error at notification insertion; business writes must roll back.
  await db.exec(`create function fail_notifications() returns trigger language plpgsql as $$ begin raise exception 'TEST_NOTIFICATION_FAILURE'; end $$;
    create trigger test_fail_notification before insert on notifications for each row execute function fail_notifications();`);
  await as("authenticated", first, () => rejected(() => submit(p4), /TEST_NOTIFICATION_FAILURE/));
  check(await scalar("select count(*)::int from applications where project_id=$1", [p4]), 0, "submit rolls back");
  await db.exec("drop trigger test_fail_notification on notifications");
  const f = await as("authenticated", first, () => submit(p4));
  const g = await as("authenticated", second, () => submit(p4));
  await db.exec("create trigger test_fail_notification before insert on notifications for each row execute function fail_notifications()");
  await as("authenticated", client, () => rejected(() => accept(f), /TEST_NOTIFICATION_FAILURE/));
  check(await scalar("select count(*)::int from applications where project_id=$1 and status='pending'", [p4]), 2, "accept and auto-reject roll back");
  check(await scalar("select status from projects where id=$1", [p4]), "recruiting", "project update rolls back");
  await as("authenticated", client, () => rejected(() => close(p4), /TEST_NOTIFICATION_FAILURE/));
  check(await scalar("select count(*)::int from applications where project_id=$1 and status='pending'", [p4]), 2, "close rolls back");
  await db.exec("drop trigger test_fail_notification on notifications");
  await as("authenticated", client, () => accept(g));
  check(await scalar("select reject_reason from applications where id=$1", [f]), "auto", "can retry after rollback");
  await as("service_role", null, async () => {
    const sql = "select create_notification($1,'amount_proposed','금액 제안','본문',$2,'contract:sample:1')";
    const n = await scalar(sql, [first, "/contracts"]);
    check(await scalar(sql, [first, "/contracts"]), n, "shared server helper deduplicates");
    await rejected(() => scalar(sql, [first, "//evil.example"]), /check constraint/);
    await rejected(() => scalar(sql, [first, "/\\evil.example"]), /check constraint/);
    await rejected(() => scalar(sql, [first, "javascript:alert(1)"]), /check constraint/);
  });
  // Constraint protects the invariant even if trusted future code bypasses RPC.
  await db.query("insert into applications(project_id,freelancer_id,cover_letter,proposed_amount,proposed_days,status) values($1,$2,'x',1,1,'accepted')", [p5, first]);
  await rejected(() => db.query("insert into applications(project_id,freelancer_id,cover_letter,proposed_amount,proposed_days,status) values($1,$2,'x',1,1,'accepted')", [p5, second]), /unique constraint/);
  await db.query("update projects set deleted_at=now() where id=$1", [p6]);
  await as("authenticated", first, () => rejected(() => submit(p6), /PROJECT_NOT_FOUND/));
  check(await scalar("select count(*)::int from pg_tables where schemaname='public' and tablename in ('applications','notifications') and rowsecurity"), 2, "both tables enforce RLS");
  console.log(`PASS: ${assertions} database assertions (ephemeral PostgreSQL/PGlite; minimum team fixtures).`);
} finally { await db.close(); }

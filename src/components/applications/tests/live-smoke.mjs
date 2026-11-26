// Real Supabase verification. No credentials are stored here or printed.
// Default is read-only preflight; --run creates three clearly named demo projects.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const accountFile = process.env.WORKBRIDGE_TEST_ACCOUNTS;
if (!url || !key || !accountFile) {
  console.error("정상 Supabase URL/공개 키와 WORKBRIDGE_TEST_ACCOUNTS(세 계정 JSON 파일 경로)가 필요합니다.");
  process.exit(2);
}
let accounts;
try { accounts = JSON.parse(await readFile(accountFile, "utf8")); }
catch { console.error("세 계정 JSON 파일의 경로와 형식을 확인해 주세요."); process.exit(2); }
const names = ["client", "freelancerA", "freelancerB"];
const clients = names.map(() => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }));
const [owner, first, second] = clients;
const report = { environment: ["127.0.0.1", "localhost"].includes(new URL(url).hostname) ? "local-fixture" : "external-supabase", at: new Date().toISOString(), checks: [], projects: [], status: "preflight" };
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); report.checks.push(message); };
const dataOf = async (request, label) => { const { data, error } = await request; if (error) throw new Error(`${label}: ${error.code ?? "request failed"}`); return data; };
const rpc = (client, name, input) => dataOf(client.rpc(name, input), name);
let waitTimer;
try {
  const ids = [];
  for (const [index, name] of names.entries()) {
    const account = accounts[name];
    if (!account?.email || !account?.password) throw new Error(`${name} 계정 정보가 필요합니다.`);
    const auth = await dataOf(clients[index].auth.signInWithPassword(account), `${name} 로그인`);
    ids.push(auth.user.id);
    check(await rpc(clients[index], "application_member_is_active"), true, `${name} active`);
    const profile = await dataOf(clients[index].from("profiles").select("id,role,name").eq("id", ids[index]).single(), "프로필 조회");
    check(profile.role, index === 0 ? "client" : "freelancer", `${name} role`);
    assert.ok(profile.name?.trim(), `${name} 이름 필요`);
  }
  check(new Set(ids).size, 3, "three distinct accounts");
  await dataOf(owner.from("notifications").select("id").limit(1), "알림 테이블 확인");
  if (!process.argv.includes("--run")) {
    console.log("PASS: 세 계정과 선행 SQL 확인. 실제 시연 데이터 생성은 --run 옵션으로 실행합니다.");
  } else {
    let received;
    const event = new Promise(resolve => { received = resolve; });
    const channel = owner.channel(`member3-smoke:${Date.now()}`).on("postgres_changes", {
      event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${ids[0]}`,
    }, () => received());
    await new Promise((resolve, reject) => {
      waitTimer = setTimeout(() => reject(new Error("Realtime 구독 연결 시간 초과")), 10000);
      channel.subscribe(status => { if (status === "SUBSCRIBED") { clearTimeout(waitTimer); resolve(); } });
    });
    const createProject = async label => {
      const row = await dataOf(owner.from("projects").insert({ client_id: ids[0], title: `[3번 시연] ${label} ${Date.now()}`, description: "지원·수락·자동 거절·알림 검증용 시연 데이터입니다.", category: "웹 개발", skills: ["TypeScript"], budget: 3000000, status: "recruiting", recruit_start_at: new Date(Date.now() - 60000).toISOString(), recruit_end_at: new Date(Date.now() + 86400000).toISOString() }).select("id").single(), "시연 프로젝트 생성");
      report.projects.push(row.id); return row.id;
    };
    const submit = (client, id) => rpc(client, "submit_application", { p_project_id: id, p_cover_letter: "프로젝트 시연 검증을 위한 지원서입니다.", p_proposed_amount: 2500000, p_proposed_days: 30 });
    const row = (client, id) => dataOf(client.from("applications").select("id,status,reject_reason,accepted_agreed_amount").eq("id", id).single(), "지원 결과 조회");
    const p = await createProject("수락");
    const a = await submit(first, p); const b = await submit(second, p);
    await Promise.race([event, new Promise((_, reject) => { waitTimer = setTimeout(() => reject(new Error("Realtime 알림 수신 시간 초과")), 10000); })]);
    clearTimeout(waitTimer); report.checks.push("realtime insert received");
    check((await first.rpc("submit_application", { p_project_id: p, p_cover_letter: "중복 지원", p_proposed_amount: 1, p_proposed_days: 1 })).error?.code, "23505", "duplicate blocked");
    await rpc(owner, "accept_application", { p_application_id: a, p_agreed_amount: 2600000 });
    check((await row(first, a)).status, "accepted", "selected accepted");
    check(Number((await row(first, a)).accepted_agreed_amount), 2600000, "amount handoff preserved");
    check((await row(second, b)).reject_reason, "auto", "other applicant auto rejected");
    check((await dataOf(first.from("applications").select("id").eq("id", b), "상대 지원서 조회")).length, 0, "other application hidden");
    const m = await createProject("직접 거절"); const manual = await submit(first, m);
    await rpc(owner, "reject_application", { p_application_id: manual });
    check((await row(first, manual)).reject_reason, "manual", "manual rejection preserved");
    const c = await createProject("마감"); const closedA = await submit(first, c); const closedB = await submit(second, c);
    check(await rpc(owner, "close_project_applications", { p_project_id: c }), 2, "close rejects all pending");
    check((await row(first, closedA)).reject_reason, "closed", "closed reason A");
    check((await row(second, closedB)).reject_reason, "closed", "closed reason B");
    const firstNotifications = await dataOf(first.from("notifications").select("id,type,link,read_at").in("event_key", [`accepted:${a}`, `manual:${manual}`, `closed:${closedA}`]), "필수 알림 조회");
    check(firstNotifications.length, 3, "accepted manual closed notifications");
    check(firstNotifications.every(n => n.link === "/me/applications"), true, "freelancer links");
    const auto = await dataOf(second.from("notifications").select("id,type").eq("event_key", `auto:${b}`).single(), "자동 거절 알림");
    check(auto.type, "application_auto_rejected", "auto notification");
    const submitted = await dataOf(owner.from("notifications").select("id,type,link,read_at").eq("event_key", `submitted:${a}`).single(), "지원 알림");
    check(submitted.link, `/projects/${p}/applicants`, "owner link");
    await dataOf(first.from("notifications").update({ read_at: new Date().toISOString() }).in("id", firstNotifications.map(n => n.id)), "읽음 처리");
    check((await dataOf(owner.from("notifications").select("read_at").eq("id", submitted.id).single(), "의뢰인 알림 유지")).read_at, submitted.read_at, "read state isolated per user");
    report.status = "passed";
    console.log(`PASS: ${report.checks.length} service-flow checks (${report.environment}); demo data retained in ${report.projects.length} projects.`);
  }
} catch (error) {
  report.status = "failed";
  // Never include request bodies, passwords, JWTs or full SDK error objects.
  console.error("검증 중단:", error instanceof assert.AssertionError ? error.message.split("\n")[0] : String(error.message));
  process.exitCode = 1;
} finally {
  clearTimeout(waitTimer);
  await Promise.allSettled(clients.map(client => client.removeAllChannels()));
  if (process.env.WORKBRIDGE_REPORT_PATH) await writeFile(process.env.WORKBRIDGE_REPORT_PATH, JSON.stringify(report, null, 2));
}

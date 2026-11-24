import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const code = ts.transpileModule(await readFile(new URL("../subscription.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 },
}).outputText;
const { subscribeToNotifications } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
let assertions = 0;
const check = (a, b, message) => { assert.deepEqual(a, b, message); assertions++; };
const settle = () => new Promise(resolve => setImmediate(resolve));

function fixture(overrides = {}) {
  const batches = new Map(); const intervals = new Map(); let sequence = 0;
  const state = { count: 1, online: true, visible: true, calls: 0, changes: 0, channelsClosed: 0, authClosed: 0, values: [], statuses: [] };
  let changed; let status; let session;
  const control = subscribeToNotifications("user-a", {
    count: async () => { state.calls++; return overrides.count ? overrides.count() : state.count; },
    listen: (c, s) => { changed = c; status = s; return () => state.channelsClosed++; },
    session: s => { session = s; return () => state.authClosed++; },
  }, {
    count: n => state.values.push(n), status: s => state.statuses.push(s), changed: () => state.changes++,
  }, {
    after: (run, delay) => { check(delay, 200, "event debounce"); const id = sequence++; batches.set(id, run); return () => batches.delete(id); },
    every: (run, delay) => { check(delay, 30000, "fallback period"); const id = sequence++; intervals.set(id, run); return () => intervals.delete(id); },
    online: () => state.online, visible: () => state.visible,
  });
  return { state, control, batches, intervals, changed: () => changed(), status: s => status(s), session: id => session(id),
    flush: async () => { const runs = [...batches.values()]; batches.clear(); runs.forEach(run => run()); await settle(); },
    tick: () => [...intervals.values()].forEach(run => run()) };
}

const f = fixture(); await settle();
check(f.state.values, [1], "initial count");
check(f.state.changes, 0, "initial query does not refresh list");
f.status("SUBSCRIBED"); await f.flush();
check(f.state.statuses.at(-1), "live", "connected status");
check(f.state.changes, 1, "reconnect checks missed notifications");
const before = f.state.calls; f.state.count = 4;
f.changed(); f.changed(); f.changed();
check(f.batches.size, 1, "burst is batched"); await f.flush();
check(f.state.calls, before + 1, "burst causes one count query");
check(f.state.values.at(-1), 4, "new count");
check(f.state.changes, 2, "list refresh after update");
f.status("CHANNEL_ERROR"); f.state.count = 5; f.tick(); await f.flush();
check(f.state.values.at(-1), 5, "poll works after channel failure");
check(f.state.statuses.at(-1), "fallback", "fallback status");
f.state.visible = false; f.tick(); check(f.batches.size, 0, "hidden tabs do not poll");
f.state.online = false; f.control.offline(); f.changed();
check(f.state.statuses.at(-1), "offline", "offline status");
check(f.batches.size, 0, "offline does not query");
f.state.count = 7; f.state.online = true; f.state.visible = true; f.control.request(); await f.flush();
check(f.state.values.at(-1), 7, "resume recovers missed count");
f.session("user-a"); check(f.state.channelsClosed, 0, "same session retains subscription");
f.changed(); f.session(null);
check(f.state.values.at(-1), null, "logout clears count");
check(f.state.statuses.at(-1), "signed_out", "logout state");
check(f.batches.size, 0, "logout cancels pending update");
check(f.intervals.size, 0, "logout clears interval");
check(f.state.channelsClosed, 1, "logout removes channel");
check(f.state.authClosed, 1, "logout removes auth listener");
const stoppedCalls = f.state.calls; f.changed(); f.status("SUBSCRIBED"); f.tick(); await f.flush();
check(f.state.calls, stoppedCalls, "stale callbacks ignored"); f.control.stop();
check(f.state.channelsClosed, 1, "cleanup is idempotent");

let resolveCount; const race = fixture({ count: () => new Promise(resolve => { resolveCount = resolve; }) });
race.changed(); await race.flush();
check(race.state.calls, 1, "only one in-flight request");
resolveCount(2); await settle();
check(race.state.calls, 2, "event during fetch triggers a fresh query");
check(race.state.values.length, 0, "stale response not published");
race.session("user-b"); resolveCount(9); await settle();
check(race.state.values, [null], "previous user result never leaks after account switch");

const failure = fixture({ count: () => Promise.reject(new Error("network")) }); await settle();
check(failure.state.values.at(-1), null, "failed request is unknown, not zero");
check(failure.state.statuses.at(-1), "fallback", "failed request degrades safely");
failure.control.stop();
console.log(`PASS: ${assertions} notification lifecycle assertions.`);

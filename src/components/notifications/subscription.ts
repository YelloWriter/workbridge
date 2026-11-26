export type NotificationConnection = "connecting" | "live" | "fallback" | "offline" | "signed_out";
export type NotificationSource = {
  count: () => Promise<number | null>;
  listen: (changed: () => void, status: (value: string) => void) => () => void;
  session: (changed: (userId: string | null) => void) => () => void;
};
type Observer = { count: (value: number | null) => void; status: (value: NotificationConnection) => void; changed: () => void };
type Clock = {
  after: (run: () => void, delay: number) => () => void;
  every: (run: () => void, delay: number) => () => void;
  visible: () => boolean;
  online: () => boolean;
};

/** Transport-independent lifecycle for reconnect and cleanup verification. */
export function subscribeToNotifications(userId: string, source: NotificationSource, observer: Observer, clock: Clock) {
  let stopped = false;
  let running = false;
  let dirty = false;
  let notify = false;
  let live = false;
  let cancelBatch: (() => void) | undefined;
  const cleanup: (() => void)[] = [];
  const register = (dispose: () => void) => { if (stopped) dispose(); else cleanup.push(dispose); };

  async function refresh() {
    if (stopped || !clock.online()) return;
    if (running) { dirty = true; return; }
    running = true;
    try {
      do {
        dirty = false;
        let count: number | null;
        try { count = await source.count(); } catch { count = null; }
        if (stopped) return;
        if (dirty) continue;
        observer.count(count);
        if (count === null) observer.status(clock.online() ? "fallback" : "offline");
        else {
          observer.status(clock.online() ? (live ? "live" : "fallback") : "offline");
          if (notify) { notify = false; observer.changed(); }
        }
      } while (dirty && !stopped);
    } finally { running = false; }
  }
  function request(changed = true) {
    if (stopped) return;
    notify ||= changed;
    if (!clock.online()) { observer.status("offline"); return; }
    if (cancelBatch) return;
    cancelBatch = clock.after(() => { cancelBatch = undefined; void refresh(); }, 200);
  }
  function stop() {
    if (stopped) return;
    stopped = true;
    cancelBatch?.();
    cleanup.splice(0).forEach(dispose => dispose());
  }
  observer.status(clock.online() ? "connecting" : "offline");
  register(source.listen(() => request(), value => {
    if (stopped) return;
    live = value === "SUBSCRIBED";
    observer.status(clock.online() ? (live ? "live" : "fallback") : "offline");
    if (live) request();
  }));
  register(source.session(id => {
    if (stopped) return;
    if (id !== userId) {
      stop(); observer.count(null); observer.status("signed_out"); observer.changed();
    }
  }));
  register(clock.every(() => { if (clock.visible()) request(); }, 30000));
  void refresh();
  return { request, stop, offline: () => { if (!stopped) observer.status("offline"); } };
}

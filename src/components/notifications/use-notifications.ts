"use client";
import { useEffect, useEffectEvent, useId, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { subscribeToNotifications, type NotificationConnection } from "./subscription";

export function useNotifications(userId: string, initialCount: number | null, onChange?: () => void) {
  const [count, setCount] = useState(initialCount);
  const [connection, setConnection] = useState<NotificationConnection>("connecting");
  const instance = useId();
  const changed = useEffectEvent(() => onChange?.());
  useEffect(() => {
    const supabase = createClient();
    const subscription = subscribeToNotifications(userId, {
      count: async () => {
        const { count, error } = await supabase.from("notifications").select("id", { count: "exact", head: true })
          .eq("user_id", userId).is("read_at", null).is("deleted_at", null);
        return error ? null : count ?? 0;
      },
      listen: (onChange, onStatus) => {
        const channel = supabase.channel(`notifications:${userId}:${instance}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, onChange)
          .subscribe(onStatus);
        return () => { void supabase.removeChannel(channel); };
      },
      session: onChange => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => onChange(session?.user.id ?? null));
        return () => subscription.unsubscribe();
      },
    }, { count: setCount, status: setConnection, changed }, {
      after: (run, delay) => { const id = window.setTimeout(run, delay); return () => window.clearTimeout(id); },
      every: (run, delay) => { const id = window.setInterval(run, delay); return () => window.clearInterval(id); },
      visible: () => document.visibilityState === "visible",
      online: () => navigator.onLine,
    });
    const resume = () => subscription.request();
    const visibility = () => { if (document.visibilityState === "visible") resume(); };
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", subscription.offline);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      subscription.stop();
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", subscription.offline);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [userId, instance]);
  return { count, connection };
}

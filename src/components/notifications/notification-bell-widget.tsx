"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { NotificationBellClient } from "./notification-bell-client";

/** Client-header entry point; no server-only imports. */
export function NotificationBellWidget() {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;
    const supabase = createClient();
    let active = true;
    let revision = 0;
    const check = async () => {
      const current = ++revision;
      const { data: { user } } = await supabase.auth.getUser();
      if (!active || current !== revision) return;
      if (!user) { setUserId(null); return; }
      const { data: member, error } = await supabase.rpc("application_member_is_active");
      if (active && current === revision) setUserId(error || !member ? null : user.id);
    };
    void check();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      revision++;
      setUserId(null);
      // Exit the auth callback before starting more auth/data requests.
      if (session && active) queueMicrotask(() => { if (active) void check(); });
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  return userId ? <NotificationBellClient key={userId} userId={userId} initialCount={null} /> : null;
}

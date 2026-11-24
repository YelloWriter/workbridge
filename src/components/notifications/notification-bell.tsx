import { createClient } from "@/lib/supabase/server";
import { Suspense } from "react";
import { connection } from "next/server";
import { isSupabaseConfigured } from "@/components/applications/server";
import { NotificationBellClient } from "./notification-bell-client";

/** Member 1: render <NotificationBell /> inside the server-rendered header. */
export function NotificationBell() {
  return <Suspense fallback={<span aria-label="알림 확인 중" className="inline-block h-11 w-11" />}><NotificationBellContent /></Suspense>;
}
async function NotificationBellContent() {
  if (!isSupabaseConfigured()) return null;
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: active, error: activeError } = await supabase.rpc("application_member_is_active");
  if (activeError || !active) return null;
  const { count, error } = await supabase.from("notifications").select("id", { count: "exact", head: true })
    .eq("user_id", user.id).is("read_at", null).is("deleted_at", null);
  return <NotificationBellClient key={`${user.id}:${error ? "unknown" : count ?? 0}`} userId={user.id} initialCount={error ? null : count ?? 0} />;
}

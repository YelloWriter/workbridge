"use client";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function NotificationBellClient({ userId, initialCount }: { userId: string; initialCount: number | null }) {
  const [count, setCount] = useState<number | null>(initialCount);
  const [signedIn, setSignedIn] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let active = true;
    let request = 0;
    const refreshCount = async () => {
      const current = ++request;
      const { count: unread, error } = await supabase.from("notifications").select("id", { count: "exact", head: true })
        .eq("user_id", userId).is("read_at", null).is("deleted_at", null);
      if (active && current === request) setCount(error ? null : unread ?? 0);
    };
    void refreshCount();
    const channel = supabase.channel(`notifications:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => {
        void refreshCount();
        if (pathname === "/notifications") router.refresh();
      }).subscribe();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user.id !== userId) {
        active = false;
        setSignedIn(false);
        setCount(null);
      }
    });
    // Works even when Realtime replication is not enabled in the team project.
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void refreshCount(); }, 30000);
    window.addEventListener("focus", refreshCount);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener("focus", refreshCount); subscription.unsubscribe(); void supabase.removeChannel(channel); };
  }, [userId, pathname, router]);
  if (!signedIn) return null;
  return <Link href="/notifications" aria-label={count === null ? "알림 개수를 확인할 수 없습니다" : `알림, 안 읽은 알림 ${count}개`}
    className="relative inline-flex h-11 min-w-11 items-center justify-center rounded-full border border-slate-200 hover:bg-slate-50">
    <Bell size={20} aria-hidden="true" />
    <span role="status" className="absolute -top-1 -right-2 min-w-5 rounded-full bg-teal-800 px-1.5 text-center text-xs leading-5 text-white">{count === null ? "!" : count > 99 ? "99+" : count}</span>
  </Link>;
}

"use client";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useNotifications } from "./use-notifications";

export function NotificationBellClient({ userId, initialCount }: { userId: string; initialCount: number | null }) {
  const { count, connection } = useNotifications(userId, initialCount);
  if (connection === "signed_out") return null;
  const label = count === null ? "알림 개수를 확인할 수 없습니다" : `알림, 안 읽은 알림 ${count}개`;
  return <Link href="/notifications" aria-label={label} title={connection === "offline" ? "인터넷 연결을 확인해 주세요" : "알림 보기"}
    className="relative inline-flex h-11 min-w-11 items-center justify-center rounded-full border border-slate-200 hover:bg-slate-50">
    <Bell size={20} aria-hidden="true" />
    <span role="status" aria-live="polite" className="absolute -top-1 -right-2 min-w-5 rounded-full bg-teal-800 px-1.5 text-center text-xs leading-5 text-white">{count === null ? "!" : count > 99 ? "99+" : count}</span>
  </Link>;
}

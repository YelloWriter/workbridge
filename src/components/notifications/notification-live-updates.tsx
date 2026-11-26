"use client";
import { useRouter } from "next/navigation";
import { useNotifications } from "./use-notifications";

/** Independent of the header, so this page works before member 1 connects it. */
export function NotificationLiveUpdates({ userId, initialCount }: { userId: string; initialCount: number }) {
  const router = useRouter();
  const { connection } = useNotifications(userId, initialCount, () => router.refresh());
  return <p role="status" className="mb-4 text-xs text-slate-500">
    {connection === "offline" ? "인터넷 연결이 돌아오면 새 소식을 다시 확인합니다." : "새 소식을 자동으로 확인하고 있어요."}
  </p>;
}

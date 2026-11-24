import Link from "next/link";
import { Suspense } from "react";
import { requireMember, isSupabaseConfigured } from "@/components/applications/server";
import { Section, Notice, SetupNotice } from "@/components/applications/section";
import { dateTime } from "@/components/applications/model";
import { readAllNotifications, readNotification } from "./actions";
import { ReadAllButton } from "@/components/notifications/read-all-button";
import { NotificationLiveUpdates } from "@/components/notifications/notification-live-updates";

export default function NotificationsPage(props: { searchParams: Promise<{ page?: string; error?: string }> }) {
  return <Suspense fallback={<Section title="알림" description="새 소식을 확인하고 있습니다."><Notice>불러오는 중…</Notice></Section>}><NotificationsContent {...props} /></Suspense>;
}
async function NotificationsContent({ searchParams }: { searchParams: Promise<{ page?: string; error?: string }> }) {
  if (!isSupabaseConfigured()) return <Section title="알림" description="지원과 프로젝트 소식을 확인하세요."><SetupNotice /></Section>;
  const query = await searchParams;
  const page = Math.min(100000, Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1));
  const pageSize = 30;
  const { supabase, user } = await requireMember("/notifications");
  const [{ data, error, count }, { count: unread, error: countError }] = await Promise.all([
    supabase.from("notifications").select("id,title,body,link,read_at,created_at", { count: "exact" })
      .eq("user_id", user.id).is("deleted_at", null).order("created_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null).is("deleted_at", null),
  ]);
  if (error || countError) throw new Error("알림을 불러오지 못했습니다.");
  return <Section title="알림" description="알림을 누르면 읽음으로 표시하고 관련 화면으로 이동합니다.">
    <NotificationLiveUpdates userId={user.id} initialCount={unread ?? 0} />
    <div className="mb-6 flex items-center justify-between gap-4"><p className="text-sm text-slate-600">안 읽은 알림 {unread ?? 0}개</p>
      <form action={readAllNotifications}><ReadAllButton /></form>
    </div>
    {query.error && <div className="mb-4"><Notice>알림을 읽음 처리하지 못했습니다. 다시 시도해 주세요.</Notice></div>}
    {!data?.length ? <Notice>표시할 알림이 없습니다.</Notice> : <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200">{data.map(notification =>
      <li key={notification.id} className={notification.read_at ? "bg-background" : "bg-teal-50/70"}>
        <form action={readNotification}>
          <input type="hidden" name="notification_id" value={notification.id} />
          <button className="w-full p-5 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-teal-700">
            <span className="flex items-start justify-between gap-4"><span className="font-semibold">{notification.title}</span>
              {!notification.read_at && <span className="shrink-0 text-xs font-semibold text-teal-800">안 읽음</span>}</span>
            <span className="mt-2 block text-sm leading-6 text-slate-600">{notification.body}</span>
            <time dateTime={notification.created_at} className="mt-3 block text-xs text-slate-500">{dateTime(notification.created_at)}</time>
          </button>
        </form>
      </li>)}</ul>}
    <nav aria-label="알림 페이지" className="mt-6 flex justify-between text-sm text-teal-800">
      {page > 1 ? <Link href={`/notifications?page=${page - 1}`}>이전</Link> : <span />}
      {page * pageSize < (count ?? 0) && <Link href={`/notifications?page=${page + 1}`}>다음</Link>}
    </nav>
  </Section>;
}

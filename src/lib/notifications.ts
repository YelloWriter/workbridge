import "server-only";
import { createClient } from "@supabase/supabase-js";

export type NotificationType =
  | "application_submitted" | "application_accepted" | "application_auto_rejected"
  | "application_rejected" | "project_closed" | "amount_proposed" | "amount_agreed"
  | "amount_declined" | "contract_signed" | "payment_completed" | "delivery_requested"
  | "delivery_approved" | "review_requested";

export type CreateNotificationInput = {
  userId: string; type: NotificationType; title: string; body: string; link: string;
  /** Stable business event ID; use this to make retries idempotent. */
  eventKey?: string;
};

/** For trusted server code only. Authorize the business event before calling.
 * Multi-table operations must call create_notification INSIDE their DB RPC;
 * calling this after a separate write cannot provide an atomic transaction.
 */
export async function createNotification({ userId, type, title, body, link, eventKey }: CreateNotificationInput): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("알림 생성에 필요한 서버 연결 정보가 없습니다.");
  if (!/^\/[\w]/.test(link) || /[\\\u0000-\u0020]/.test(link) || link.length > 1000) throw new Error("올바른 내부 알림 주소가 아닙니다.");
  if (!title.trim() || title.length > 200 || body.length > 2000) throw new Error("알림 내용 길이를 확인해 주세요.");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await admin.rpc("create_notification", {
    p_user_id: userId, p_type: type, p_title: title.trim(), p_body: body, p_link: link,
    p_event_key: eventKey ?? null,
  });
  if (error) throw new Error("알림을 저장하지 못했습니다.");
  return data as string;
}

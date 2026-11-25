import "server-only";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

type ConfirmResult = { ok: true } | { ok: false; error: string };

function testSecret() {
  const secret = process.env.TOSS_SECRET_KEY ?? "";
  if (!secret.startsWith("test_")) return null;
  return secret;
}

async function askToss(orderId: string, paymentKey: string, amount: number) {
  const secret = testSecret();
  if (!secret) {
    return { ok: false as const, error: "서버 테스트 시크릿 키가 없습니다. 라이브 키는 쓰지 않습니다." };
  }
  const response = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${secret}:`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ paymentKey, orderId, amount }),
  });
  const body = (await response.json().catch(() => ({}))) as { code?: string; totalAmount?: number };
  if (body.code === "ALREADY_PROCESSED_PAYMENT") return { ok: true as const, amount };
  if (!response.ok) return { ok: false as const, error: "토스 승인에 실패했습니다." };
  if (Number(body.totalAmount) !== amount) {
    return { ok: false as const, error: "토스가 승인한 금액이 계약 금액과 다릅니다." };
  }
  return { ok: true as const, amount };
}

export async function confirmPaymentAsClient(orderId: string, paymentKey: string, browserAmount: number): Promise<ConfirmResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { data: payment } = await supabase
    .from("payments")
    .select("amount, status, payment_key")
    .eq("order_id", orderId)
    .maybeSingle();
  if (!payment) return { ok: false, error: "결제를 찾을 수 없습니다." };
  if (Number(browserAmount) !== Number(payment.amount)) {
    return { ok: false, error: "브라우저가 보낸 금액이 계약 금액과 다릅니다. 승인을 중단했습니다." };
  }
  if ((payment.status === "paid" || payment.status === "paid_out") && payment.payment_key === paymentKey) {
    return { ok: true };
  }
  if (payment.status !== "ready") return { ok: false, error: "이미 처리된 결제입니다." };

  const toss = await askToss(orderId, paymentKey, Number(payment.amount));
  if (!toss.ok) return toss;

  const { error } = await supabase.rpc("mark_payment_paid", {
    p_order_id: orderId,
    p_payment_key: paymentKey,
    p_amount: Number(payment.amount),
  });
  if (error) {
    const again = await supabase.from("payments").select("status, payment_key").eq("order_id", orderId).maybeSingle();
    if (again.data && (again.data.status === "paid" || again.data.status === "paid_out") && again.data.payment_key === paymentKey) {
      return { ok: true };
    }
    return { ok: false, error: "결제 상태를 저장하지 못했습니다." };
  }
  return { ok: true };
}

export async function syncPaymentFromWebhook(orderId: string, paymentKey: string, amount: number): Promise<ConfirmResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ok: false, error: "서버 연결 정보가 없습니다." };

  const admin = createAdmin(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: payment } = await admin.from("payments").select("amount, status, payment_key").eq("order_id", orderId).maybeSingle();
  if (!payment) return { ok: false, error: "결제를 찾을 수 없습니다." };
  if (Number(amount) !== Number(payment.amount)) {
    return { ok: false, error: "웹훅 금액이 계약 금액과 다릅니다." };
  }
  if ((payment.status === "paid" || payment.status === "paid_out") && payment.payment_key === paymentKey) {
    return { ok: true };
  }
  if (payment.status !== "ready") return { ok: false, error: "이미 끝난 결제는 바꾸지 않습니다." };

  const toss = await askToss(orderId, paymentKey, Number(payment.amount));
  if (!toss.ok) return toss;

  const { error } = await admin.rpc("sync_payment_from_toss", {
    p_order_id: orderId,
    p_payment_key: paymentKey,
    p_amount: Number(payment.amount),
  });
  if (error) {
    if (error.message.includes("PAYMENT_KEY_CONFLICT")) {
      return { ok: false, error: "같은 주문에 다른 결제 키가 왔습니다. 상태를 유지합니다." };
    }
    const again = await admin.from("payments").select("status, payment_key").eq("order_id", orderId).maybeSingle();
    if (again.data && (again.data.status === "paid" || again.data.status === "paid_out") && again.data.payment_key === paymentKey) {
      return { ok: true };
    }
    return { ok: false, error: "결제 상태를 저장하지 못했습니다." };
  }
  return { ok: true };
}

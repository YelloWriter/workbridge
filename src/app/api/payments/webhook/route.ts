import { NextResponse } from "next/server";
import { syncPaymentFromWebhook } from "@/components/payments/confirm";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    data?: { orderId?: string; paymentKey?: string; totalAmount?: number; status?: string };
  } | null;
  const data = body?.data;
  if (!data?.orderId || !data.paymentKey || data.totalAmount == null) {
    return NextResponse.json({ ok: false, error: "웹훅 내용이 없습니다." }, { status: 400 });
  }
  if (data.status && data.status !== "DONE") {
    return NextResponse.json({ ok: true, ignored: true });
  }
  const result = await syncPaymentFromWebhook(data.orderId, data.paymentKey, Number(data.totalAmount));
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}

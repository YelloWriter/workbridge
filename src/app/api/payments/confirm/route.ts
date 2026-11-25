import { NextResponse } from "next/server";
import { confirmPaymentAsClient } from "@/components/payments/confirm";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    orderId?: string;
    paymentKey?: string;
    amount?: number;
  } | null;
  if (!body?.orderId || !body.paymentKey || body.amount == null) {
    return NextResponse.json({ ok: false, error: "승인에 필요한 값이 없습니다." }, { status: 400 });
  }
  const result = await confirmPaymentAsClient(body.orderId, body.paymentKey, Number(body.amount));
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

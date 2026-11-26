"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function message(error: { message: string } | null, fallback: string) {
  if (!error) return null;
  const known: Record<string, string> = {
    CONTRACT_NOT_SIGNED: "서명이 끝난 계약만 결제할 수 있습니다.",
    PROJECT_NOT_READY_FOR_PAYMENT: "프로젝트가 계약 대기 상태가 아닙니다.",
    PAYMENT_ALREADY_EXISTS: "이미 진행 중인 결제가 있습니다.",
    CLIENT_REQUIRED: "의뢰인만 할 수 있습니다.",
    FREELANCER_REQUIRED: "프리랜서만 납품을 요청할 수 있습니다.",
    ESCROW_REQUIRED: "보관 중인 결제만 정산할 수 있습니다.",
    PROJECT_NOT_IN_PROGRESS: "작업 중인 프로젝트만 납품 요청할 수 있습니다.",
    PROJECT_NOT_DELIVERED: "납품 요청 상태에서만 완료 승인할 수 있습니다.",
  };
  const code = Object.keys(known).find((item) => error.message.includes(item));
  return code ? known[code] : fallback;
}

export async function startPayment(contractId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_payment", { p_contract_id: contractId });
  if (error) return { error: message(error, "결제를 시작하지 못했습니다. 계약 표가 있는지 확인해 주세요.") };
  revalidatePath(`/payments/${contractId}`);
  return { error: null };
}

export async function requestDelivery(contractId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_delivery", { p_contract_id: contractId });
  if (error) return { error: message(error, "납품 요청을 저장하지 못했습니다.") };
  revalidatePath(`/payments/${contractId}`);
  return { error: null };
}

export async function approveDelivery(contractId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_delivery", { p_contract_id: contractId });
  if (error) return { error: message(error, "완료 승인을 저장하지 못했습니다.") };
  revalidatePath(`/payments/${contractId}`);
  revalidatePath("/reviews/new/" + contractId);
  return { error: null };
}

export async function markPaymentFailed(orderId: string) {
  const supabase = await createClient();
  await supabase.rpc("mark_payment_failed", { p_order_id: orderId });
  redirect("/payments/fail?saved=1");
}

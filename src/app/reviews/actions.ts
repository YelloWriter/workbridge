"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { REVIEW_TAGS } from "@/components/reviews/tags";

export async function createReview(input: { contractId: string; rating: number; content: string; tags: string[] }) {
  const tags = input.tags.filter((tag) => (REVIEW_TAGS as readonly string[]).includes(tag)).slice(0, 5);
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_review", {
    p_contract_id: input.contractId,
    p_rating: input.rating,
    p_content: input.content,
    p_tags: tags,
  });
  if (error) {
    if (error.message.includes("REVIEW_ALREADY_EXISTS")) return { error: "이미 작성한 리뷰는 수정할 수 없습니다." };
    if (error.message.includes("PROJECT_NOT_COMPLETED")) return { error: "완료된 프로젝트에서만 리뷰를 쓸 수 있습니다." };
    return { error: "리뷰를 저장하지 못했습니다." };
  }
  revalidatePath(`/reviews/new/${input.contractId}`);
  redirect(`/reviews/new/${input.contractId}`);
}

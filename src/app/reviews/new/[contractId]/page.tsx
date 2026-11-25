import { Suspense } from "react";
import { connection } from "next/server";
import { ReviewForm } from "@/components/reviews/review-form";
import { createClient } from "@/lib/supabase/server";

export default function ReviewPage({ params }: { params: Promise<{ contractId: string }> }) {
  return (
    <Suspense fallback={<p className="p-8 text-center">리뷰 화면을 준비하고 있습니다.</p>}>
      <ReviewContent params={params} />
    </Suspense>
  );
}

async function ReviewContent({ params }: { params: Promise<{ contractId: string }> }) {
  await connection();
  const { contractId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <p className="mx-auto max-w-xl p-8">로그인한 뒤 다시 열어 주세요.</p>;

  const { data: contract } = await supabase.from("contracts").select("id, project_id, client_id, freelancer_id").eq("id", contractId).maybeSingle();
  if (!contract || (contract.client_id !== user.id && contract.freelancer_id !== user.id)) {
    return <p className="mx-auto max-w-xl p-8">이 계약을 볼 수 없습니다.</p>;
  }
  const { data: project } = await supabase.from("projects").select("status").eq("id", contract.project_id).maybeSingle();
  const { data: mine } = await supabase.from("reviews").select("rating, content, tags").eq("contract_id", contractId).eq("reviewer_id", user.id).maybeSingle();

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-12">
      <h1 className="text-2xl font-semibold">리뷰</h1>
      {mine ? (
        <article className="mt-6 text-sm">
          <p>{mine.rating}점</p>
          <p className="mt-2 whitespace-pre-wrap">{mine.content}</p>
          <p className="mt-2 text-slate-500">{(mine.tags ?? []).join(" · ")}</p>
          <p className="mt-4 text-slate-500">한 번 등록한 리뷰는 수정하지 않습니다.</p>
        </article>
      ) : project?.status !== "completed" ? (
        <p className="mt-6 text-sm text-slate-600">완료 승인 뒤에 리뷰를 쓸 수 있습니다.</p>
      ) : (
        <div className="mt-6"><ReviewForm contractId={contractId} /></div>
      )}
    </main>
  );
}

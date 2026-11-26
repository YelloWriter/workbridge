import { createClient } from "@/lib/supabase/server";

export async function PublicReviews({ userId }: { userId: string }) {
  const supabase = await createClient();
  const [{ data: summary }, { data: reviews, error }] = await Promise.all([
    supabase.from("review_summaries").select("average_rating, review_count").eq("reviewee_id", userId).maybeSingle(),
    supabase
      .from("reviews")
      .select("id, rating, content, tags, created_at, reviewer_id")
      .eq("reviewee_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  if (error) {
    return <p className="text-sm text-slate-500">리뷰를 아직 불러올 수 없습니다.</p>;
  }

  const names = new Map<string, string>();
  const ids = [...new Set((reviews ?? []).map((review) => review.reviewer_id))];
  if (ids.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, name").in("id", ids);
    for (const profile of profiles ?? []) names.set(profile.id, profile.name || "이름 없음");
  }

  return (
    <section data-slot="public-reviews" data-user-id={userId} className="mt-10">
      <h2 className="text-lg font-semibold text-slate-900">리뷰</h2>
      {!summary || summary.review_count === 0 ? (
        <p className="mt-2 text-sm text-slate-500">아직 리뷰가 없습니다.</p>
      ) : (
        <p className="mt-2 text-sm text-slate-700">평균 {summary.average_rating}점 · {summary.review_count}개</p>
      )}
      <ul className="mt-4 space-y-4">
        {(reviews ?? []).map((review) => (
          <li key={review.id} className="rounded-lg border border-slate-200 p-4">
            <p className="text-sm font-medium text-slate-900">{names.get(review.reviewer_id) ?? "회원"} · {review.rating}점</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{review.content}</p>
            {review.tags?.length > 0 && <p className="mt-2 text-xs text-slate-500">{review.tags.join(" · ")}</p>}
            <p className="mt-2 text-xs text-slate-400">{new Date(review.created_at).toLocaleDateString("ko-KR")}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

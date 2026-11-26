"use client";

import { useState } from "react";
import { createReview } from "@/app/reviews/actions";
import { REVIEW_TAGS } from "@/components/reviews/tags";

export function ReviewForm({ contractId }: { contractId: string }) {
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function toggle(tag: string) {
    setTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag].slice(0, 5));
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        const result = await createReview({ contractId, rating, content, tags });
        setError(result.error);
        setPending(false);
      }}
    >
      <label className="block text-sm text-slate-700">
        별점
        <select value={rating} onChange={(event) => setRating(Number(event.target.value))} className="mt-1 block rounded-md border border-slate-300 px-3 py-2">
          {[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score}점</option>)}
        </select>
      </label>
      <label className="block text-sm text-slate-700">
        내용
        <textarea value={content} onChange={(event) => setContent(event.target.value)} required maxLength={1000} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" rows={5} />
      </label>
      <fieldset>
        <legend className="text-sm text-slate-700">태그</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {REVIEW_TAGS.map((tag) => (
            <label key={tag} className="rounded-full border border-slate-300 px-3 py-1 text-sm">
              <input type="checkbox" className="mr-1" checked={tags.includes(tag)} onChange={() => toggle(tag)} />
              {tag}
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">의뢰인은 책임감·소통·기술력, 프리랜서는 명확한 요구사항·신속한 피드백을 떠올리되, 저장되는 태그는 월요일에 정한 다섯 가지입니다.</p>
      </fieldset>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={pending} className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">리뷰 등록</button>
    </form>
  );
}

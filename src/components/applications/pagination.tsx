import Link from "next/link";

export const applicationPageSize = 30;
export function pageNumber(value: string | string[] | undefined) {
  return Math.min(100000, Math.max(1, Number.parseInt(typeof value === "string" ? value : "1", 10) || 1));
}
export function ApplicationPagination({ path, page, count }: { path: string; page: number; count: number }) {
  return <nav aria-label="지원서 페이지" className="mt-6 flex justify-between text-sm text-teal-800">
    {page > 1 ? <Link href={`${path}?page=${page - 1}`}>이전</Link> : <span />}
    <span>{page}페이지</span>
    {page * applicationPageSize < count ? <Link href={`${path}?page=${page + 1}`}>다음</Link> : <span />}
  </nav>;
}

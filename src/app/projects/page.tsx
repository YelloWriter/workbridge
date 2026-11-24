import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { ProjectFilters } from "@/components/projects/filters";
import { isSupabaseConfigured, searchProjects } from "@/components/projects/server";
import { listHref, parseListParams, sortLabels, type SortKey } from "@/components/projects/model";
import { buttonClass, Notice, PageShell, Pagination, PreviewNotice, ProjectCard } from "@/components/projects/ui";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function ProjectsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell
      title="프로젝트 찾기"
      description="모집 중인 프로젝트를 키워드와 조건으로 찾아보세요."
      actions={<Link href="/projects/new" className={buttonClass}>프로젝트 등록</Link>}
    >
      <Suspense fallback={<Notice>프로젝트를 불러오고 있어요…</Notice>}>
        <ProjectList searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}

async function ProjectList({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const params = parseListParams(await searchParams);
  const { items, total } = await searchProjects(params);
  const last = Math.max(1, Math.ceil(total / 10));

  return (
    <>
      {!isSupabaseConfigured() && <PreviewNotice />}
      <ProjectFilters params={params} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">총 <b className="text-slate-900">{total.toLocaleString("ko-KR")}</b>개{params.page > 1 && ` · ${params.page}/${last} 페이지`}</p>
        <nav aria-label="정렬" className="flex gap-1 text-sm">
          {(Object.keys(sortLabels) as SortKey[]).map((key) => (
            <Link key={key} href={listHref(params, { sort: key, page: 1 })} aria-current={params.sort === key ? "true" : undefined}
              className={`rounded-full px-3 py-1.5 ${params.sort === key ? "bg-slate-900 font-semibold text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              {sortLabels[key]}
            </Link>
          ))}
        </nav>
      </div>
      {items.length === 0 ? (
        <Notice>조건에 맞는 프로젝트가 없어요. 검색어나 필터를 줄여 보세요. <Link href="/projects" className="underline">전체 보기</Link></Notice>
      ) : (
        <div className="space-y-4">{items.map((project) => <ProjectCard key={project.id} project={project} />)}</div>
      )}
      <Pagination params={params} total={total} />
    </>
  );
}

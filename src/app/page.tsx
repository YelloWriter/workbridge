import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { CATEGORIES } from "@/lib/constants";
import { isSupabaseConfigured, searchProjects } from "@/components/projects/server";
import { buttonClass, Notice, PreviewNotice, ProjectCard, subButtonClass } from "@/components/projects/ui";
import type { ListParams } from "@/components/projects/model";

const LATEST: ListParams = {
  q: "", category: "", skills: [], budgetMin: null, budgetMax: null,
  deadlineFrom: "", deadlineTo: "", status: "recruiting", sort: "latest", page: 1,
};

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-12 sm:py-20">
      <section aria-labelledby="hero">
        <p className="mb-3 text-sm font-semibold text-teal-700">WorkBridge</p>
        <h1 id="hero" className="max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          맞는 프로젝트와 맞는 사람을 안전하게 이어 드려요
        </h1>
        <p className="mt-4 max-w-xl text-lg text-slate-600">의뢰인은 프로젝트를 올리고, 프리랜서는 지원해요. 계약과 결제까지 한곳에서 해결합니다.</p>

        <form action="/projects" method="get" role="search" className="mt-8 flex max-w-2xl flex-wrap gap-3">
          <label className="min-w-0 flex-1">
            <span className="sr-only">프로젝트 검색</span>
            <input type="search" name="q" maxLength={100} placeholder="어떤 프로젝트를 찾으세요? 예: 쇼핑몰, 앱, 로고"
              className="w-full rounded-lg border border-slate-300 bg-background p-4 focus:outline-2 focus:outline-teal-600" />
          </label>
          <button type="submit" className={buttonClass}>검색</button>
        </form>

        <nav aria-label="카테고리" className="mt-6 flex flex-wrap gap-2">
          {CATEGORIES.map((category) => (
            <Link key={category} href={`/projects?category=${encodeURIComponent(category)}`}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium hover:border-teal-800 hover:bg-teal-50">
              {category}
            </Link>
          ))}
        </nav>
      </section>

      <section aria-labelledby="latest" className="mt-16">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <h2 id="latest" className="text-2xl font-bold">최신 프로젝트</h2>
          <div className="flex gap-2">
            <Link href="/projects" className={subButtonClass}>전체 보기</Link>
            <Link href="/projects/new" className={buttonClass}>프로젝트 등록</Link>
          </div>
        </div>
        <Suspense fallback={<Notice>프로젝트를 불러오고 있어요…</Notice>}>
          <LatestProjects />
        </Suspense>
      </section>
    </main>
  );
}

async function LatestProjects() {
  await connection();
  const { items } = await searchProjects(LATEST, 6);
  return (
    <>
      {!isSupabaseConfigured() && <PreviewNotice />}
      {items.length === 0 ? (
        <Notice>지금 모집 중인 프로젝트가 없어요. 첫 프로젝트를 등록해 보세요.</Notice>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">{items.map((project) => <ProjectCard key={project.id} project={project} />)}</div>
      )}
    </>
  );
}

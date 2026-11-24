import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ActionButton } from "@/components/projects/action-button";
import {
  getClientSummary, getProject, getRecommended, getViewer, isBookmarked, isSupabaseConfigured,
  type Viewer,
} from "@/components/projects/server";
import { currentTime, formatDate, money, remainingText, uuidPattern, type Project } from "@/components/projects/model";
import {
  buttonClass, dangerButtonClass, Notice, PageShell, PreviewNotice, ProjectCard, SkillTags, StatusBadge, subButtonClass,
} from "@/components/projects/ui";
import { closeProject, toggleBookmark } from "@/app/projects/actions";

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageShell title="프로젝트"><Notice>프로젝트를 불러오고 있어요…</Notice></PageShell>}>
      <ProjectDetail params={params} />
    </Suspense>
  );
}

async function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();
  const project = await getProject(id);
  if (!project) notFound();

  const [viewer, client, recommended] = await Promise.all([
    getViewer(),
    getClientSummary(project.client_id),
    getRecommended(project),
  ]);
  const bookmarked = viewer.id && viewer.role === "freelancer" ? await isBookmarked(viewer.id, project.id) : false;
  const now = currentTime();

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:py-14">
      {!isSupabaseConfigured() && <PreviewNotice />}
      <nav aria-label="경로" className="mb-6 text-sm text-slate-600"><Link href="/projects" className="hover:underline">← 프로젝트 찾기</Link></nav>

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <article>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={project.display_status} />
            <span className="text-sm text-slate-500">{project.category}</span>
            <span className="text-sm text-slate-500">· 등록 {formatDate(project.created_at)}</span>
          </div>
          <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight">{project.title}</h1>

          <dl className="mt-6 grid gap-4 rounded-xl bg-slate-50 p-5 sm:grid-cols-2">
            <Fact label="예산" value={money(project.budget)} />
            <Fact label="지원자" value={`${project.applicant_count}명`} />
            <Fact label="모집 시작" value={formatDate(project.recruit_start_at)} />
            <Fact label="모집 마감" value={`${formatDate(project.recruit_end_at)}${project.display_status === "closed" ? "" : ` · ${remainingText(project.recruit_end_at, now)}`}`} />
            <div className="sm:col-span-2">
              <dt className="mb-2 text-sm text-slate-500">필요 기술</dt>
              <dd>{project.skills.length ? <SkillTags skills={project.skills} /> : <span className="text-sm text-slate-600">정해 두지 않았어요</span>}</dd>
            </div>
          </dl>

          <section className="mt-8">
            <h2 className="text-lg font-semibold">프로젝트 설명</h2>
            <p className="mt-3 whitespace-pre-wrap break-words leading-7 text-slate-800">{project.description}</p>
          </section>

          <section className="mt-8 rounded-xl border border-slate-200 p-5">
            <h2 className="text-lg font-semibold">의뢰인</h2>
            {client ? (
              <p className="mt-2 text-sm leading-7 text-slate-700">
                <Link href={`/users/${client.id}`} className="font-semibold text-teal-800 underline">{client.name || "이름 없음"}</Link>
                {client.company_name && <> · {client.company_name}</>}
                {client.business_field && <> · {client.business_field}</>}
              </p>
            ) : <p className="mt-2 text-sm text-slate-600">의뢰인 정보를 불러올 수 없어요.</p>}
          </section>
        </article>

        <aside aria-label="지원 영역" className="h-fit space-y-3 rounded-2xl border border-slate-200 p-5 lg:sticky lg:top-6">
          <p className="text-sm text-slate-600">{project.display_status === "closed" ? "모집이 끝났어요" : remainingText(project.recruit_end_at, now)}</p>
          <p className="text-xl font-bold">{money(project.budget)}</p>
          <ViewerButtons project={project} viewer={viewer} bookmarked={bookmarked} />
        </aside>
      </div>

      {recommended.length > 0 && (
        <section className="mt-14" aria-labelledby="recommended">
          <h2 id="recommended" className="mb-4 text-xl font-bold">추천 프로젝트</h2>
          <p className="mb-4 text-sm text-slate-600">같은 카테고리이거나 필요한 기술이 비슷한 모집 중 프로젝트예요.</p>
          <div className="grid gap-4 md:grid-cols-2">{recommended.map((p) => <ProjectCard key={p.id} project={p} />)}</div>
        </section>
      )}
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-sm text-slate-500">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>;
}

/** 보는 사람(비로그인 / 프리랜서 / 등록한 의뢰인 / 다른 의뢰인)에 따라 다른 버튼 */
function ViewerButtons({ project, viewer, bookmarked }: { project: Project; viewer: Viewer; bookmarked: boolean }) {
  const open = project.display_status === "recruiting";
  const next = `/projects/${project.id}`;

  if (!viewer.id) {
    return (
      <>
        {open ? <Link href={`/login?next=${encodeURIComponent(`${next}/apply`)}`} className={`${buttonClass} w-full`}>로그인하고 지원하기</Link>
          : <span className={`${subButtonClass} w-full cursor-not-allowed opacity-60`}>모집이 끝났어요</span>}
        <Link href={`/login?next=${encodeURIComponent(next)}`} className={`${subButtonClass} w-full`}>☆ 북마크</Link>
      </>
    );
  }

  if (viewer.id === project.client_id) {
    const editable = open && ["scheduled", "recruiting"].includes(project.status);
    return (
      <>
        <Link href={`${next}/applicants`} className={`${buttonClass} w-full`}>지원자 보기 ({project.applicant_count})</Link>
        {editable && <Link href={`${next}/edit`} className={`${subButtonClass} w-full`}>수정</Link>}
        {open && (
          <ActionButton action={closeProject.bind(null, project.id)} label="모집 마감" pendingLabel="마감하고 있어요…"
            confirmText="지금 모집을 마감할까요? 검토 중인 지원은 모두 거절 처리되고 지원자에게 알림이 가요."
            className={`${dangerButtonClass} w-full`} />
        )}
      </>
    );
  }

  if (viewer.role === "freelancer") {
    return (
      <>
        {open ? <Link href={`${next}/apply`} className={`${buttonClass} w-full`}>지원하기</Link>
          : <span className={`${subButtonClass} w-full cursor-not-allowed opacity-60`}>모집이 끝났어요</span>}
        <ActionButton action={toggleBookmark.bind(null, project.id, !bookmarked)} ariaPressed={bookmarked}
          label={bookmarked ? "★ 북마크 해제" : "☆ 북마크"} pendingLabel="저장하고 있어요…" className={`${subButtonClass} w-full`} />
      </>
    );
  }

  return <p className="text-sm text-slate-600">프리랜서 계정으로 지원할 수 있어요.</p>;
}

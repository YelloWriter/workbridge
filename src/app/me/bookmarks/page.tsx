import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ActionButton } from "@/components/projects/action-button";
import { getViewer, isSupabaseConfigured, listMyBookmarks } from "@/components/projects/server";
import { Notice, PageShell, PreviewNotice, ProjectCard, subButtonClass } from "@/components/projects/ui";
import { toggleBookmark } from "@/app/projects/actions";

export default function MyBookmarksPage() {
  return (
    <PageShell title="내 북마크" description="관심 있는 프로젝트를 모아서 볼 수 있어요.">
      <Suspense fallback={<Notice>불러오고 있어요…</Notice>}>
        <MyBookmarks />
      </Suspense>
    </PageShell>
  );
}

async function MyBookmarks() {
  await connection();
  const preview = !isSupabaseConfigured();
  let userId = "preview";
  if (!preview) {
    const viewer = await getViewer();
    if (!viewer.id) redirect("/login?next=%2Fme%2Fbookmarks");
    if (!viewer.role) redirect("/onboarding/role?next=%2Fme%2Fbookmarks");
    if (viewer.role !== "freelancer") return <Notice>북마크는 프리랜서 계정에서 쓸 수 있어요. 의뢰인은 <Link href="/me/projects" className="underline">내 프로젝트</Link>를 이용해 주세요.</Notice>;
    userId = viewer.id;
  }

  const projects = await listMyBookmarks(userId);
  return (
    <>
      {preview && <PreviewNotice />}
      {projects.length === 0 ? (
        <Notice>아직 북마크한 프로젝트가 없어요. <Link href="/projects" className="underline">프로젝트 찾기</Link></Notice>
      ) : (
        <div className="space-y-4">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              footer={
                <>
                  <Link href={`/projects/${project.id}`} className={subButtonClass}>상세</Link>
                  <ActionButton action={toggleBookmark.bind(null, project.id, false)} label="★ 북마크 해제" pendingLabel="해제하고 있어요…" className={subButtonClass} />
                </>
              }
            />
          ))}
        </div>
      )}
    </>
  );
}

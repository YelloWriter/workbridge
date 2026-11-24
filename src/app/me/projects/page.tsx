import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ActionButton } from "@/components/projects/action-button";
import { getViewer, isSupabaseConfigured, listMyProjects } from "@/components/projects/server";
import { currentTime, dealStatusLabel } from "@/components/projects/model";
import { buttonClass, dangerButtonClass, Notice, PageShell, PreviewNotice, ProjectCard, subButtonClass } from "@/components/projects/ui";
import { closeProject, deleteProject } from "@/app/projects/actions";

export default function MyProjectsPage() {
  return (
    <PageShell
      title="내 프로젝트"
      description="내가 등록한 프로젝트와 거래 단계를 한눈에 확인해요."
      actions={<Link href="/projects/new" className={buttonClass}>프로젝트 등록</Link>}
    >
      <Suspense fallback={<Notice>불러오고 있어요…</Notice>}>
        <MyProjects />
      </Suspense>
    </PageShell>
  );
}

async function MyProjects() {
  await connection();
  const preview = !isSupabaseConfigured();
  let userId = "preview";
  if (!preview) {
    const viewer = await getViewer();
    if (!viewer.id) redirect("/login?next=%2Fme%2Fprojects");
    if (!viewer.role) redirect("/onboarding/role?next=%2Fme%2Fprojects");
    if (viewer.role !== "client") return <Notice>내 프로젝트는 의뢰인 계정에서 볼 수 있어요. 프리랜서는 <Link href="/me/applications" className="underline">내 지원 현황</Link>을 이용해 주세요.</Notice>;
    userId = viewer.id;
  }

  const projects = await listMyProjects(userId);
  const now = currentTime();

  return (
    <>
      {preview && <PreviewNotice />}
      {projects.length === 0 ? (
        <Notice>아직 등록한 프로젝트가 없어요. <Link href="/projects/new" className="underline">첫 프로젝트 등록하기</Link></Notice>
      ) : (
        <div className="space-y-4">
          {projects.map((project) => {
            const open = project.display_status === "recruiting";
            const editable = open && ["scheduled", "recruiting"].includes(project.status);
            const deletable = ["scheduled", "recruiting", "closed", "cancelled"].includes(project.status);
            return (
              <ProjectCard
                key={project.id}
                project={project}
                statusLabel={dealStatusLabel(project, now)}
                footer={
                  <>
                    <Link href={`/projects/${project.id}`} className={subButtonClass}>상세</Link>
                    <Link href={`/projects/${project.id}/applicants`} className={subButtonClass}>지원자 보기 ({project.applicant_count})</Link>
                    {editable && <Link href={`/projects/${project.id}/edit`} className={subButtonClass}>수정</Link>}
                    {open && (
                      <ActionButton action={closeProject.bind(null, project.id)} label="모집 마감" pendingLabel="마감하고 있어요…"
                        confirmText="지금 모집을 마감할까요? 검토 중인 지원은 모두 거절 처리되고 지원자에게 알림이 가요."
                        className={dangerButtonClass} />
                    )}
                    {deletable && (
                      <ActionButton action={deleteProject.bind(null, project.id)} label="삭제" pendingLabel="삭제하고 있어요…"
                        confirmText="이 프로젝트를 삭제할까요?" className={dangerButtonClass} />
                    )}
                  </>
                }
              />
            );
          })}
        </div>
      )}
    </>
  );
}

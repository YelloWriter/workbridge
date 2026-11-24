import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { ActionButton } from "@/components/projects/action-button";
import { ProjectForm } from "@/components/projects/project-form";
import { getProject, getViewer, isSupabaseConfigured } from "@/components/projects/server";
import { currentTime, kstDate, uuidPattern } from "@/components/projects/model";
import { dangerButtonClass, Notice, PageShell } from "@/components/projects/ui";
import { deleteProject, updateProject } from "@/app/projects/actions";

export default function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PageShell title="프로젝트 수정" description="내가 등록한 프로젝트만 고칠 수 있어요.">
      <Suspense fallback={<Notice>불러오고 있어요…</Notice>}>
        <EditProjectContent params={params} />
      </Suspense>
    </PageShell>
  );
}

async function EditProjectContent({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();
  const preview = !isSupabaseConfigured();
  const next = `/projects/${id}/edit`;

  if (!preview) {
    const viewer = await getViewer();
    if (!viewer.id) redirect(`/login?next=${encodeURIComponent(next)}`);
    if (viewer.role !== "client") return <Notice>프로젝트 수정은 의뢰인 계정에서 할 수 있어요.</Notice>;
  }
  const project = await getProject(id);
  if (!project) notFound();
  if (!preview) {
    const viewer = await getViewer();
    // 남의 프로젝트는 있는지조차 알려 주지 않습니다.
    if (viewer.id !== project.client_id) notFound();
  }
  if (project.display_status === "closed" || !["scheduled", "recruiting"].includes(project.status)) {
    return <Notice>모집이 끝났거나 계약이 진행 중인 프로젝트는 수정할 수 없어요.</Notice>;
  }

  return (
    <div className="space-y-8">
      <ProjectForm
        mode="edit"
        action={updateProject.bind(null, id)}
        today={kstDate(currentTime())}
        preview={preview}
        lockBudgetAndEnd={project.applicant_count > 0}
        cancelHref={`/projects/${id}`}
        initial={{
          title: project.title, description: project.description, category: project.category, skills: project.skills,
          budget: String(project.budget), startDate: kstDate(project.recruit_start_at), endDate: kstDate(project.recruit_end_at),
        }}
      />
      <section className="rounded-2xl border border-red-200 p-5">
        <h2 className="font-semibold text-red-800">프로젝트 삭제</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          삭제하면 목록과 검색에서 사라져요. 지원자가 있는 모집 중 프로젝트는 먼저 모집을 마감해야 삭제할 수 있어요.
        </p>
        <div className="mt-4">
          <ActionButton action={deleteProject.bind(null, id)} label="프로젝트 삭제" pendingLabel="삭제하고 있어요…"
            confirmText="이 프로젝트를 삭제할까요?" className={dangerButtonClass} />
        </div>
      </section>
    </div>
  );
}

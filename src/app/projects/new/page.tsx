import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ProjectForm } from "@/components/projects/project-form";
import { getViewer, isSupabaseConfigured } from "@/components/projects/server";
import { currentTime, kstDate } from "@/components/projects/model";
import { Notice, PageShell } from "@/components/projects/ui";
import { createProject } from "@/app/projects/actions";

const TITLE = "프로젝트 등록";
const DESCRIPTION = "세 단계로 간단하게 등록해요. 등록하면 바로(또는 시작일부터) 프리랜서가 지원할 수 있어요.";

export default function NewProjectPage() {
  return (
    <PageShell title={TITLE} description={DESCRIPTION}>
      <Suspense fallback={<Notice>불러오고 있어요…</Notice>}>
        <NewProjectContent />
      </Suspense>
    </PageShell>
  );
}

async function NewProjectContent() {
  await connection();
  const today = kstDate(currentTime());

  // 키(.env.local)가 없으면 화면만 미리 보여 줍니다. 저장은 되지 않습니다.
  if (!isSupabaseConfigured()) {
    return <ProjectForm mode="create" action={createProject} today={today} preview cancelHref="/projects" />;
  }

  const next = "/projects/new";
  const viewer = await getViewer();
  if (!viewer.id) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!viewer.role) redirect(`/onboarding/role?next=${encodeURIComponent(next)}`);
  if (viewer.role !== "client") return <Notice>프로젝트 등록은 의뢰인 계정에서 할 수 있어요. 내 프로필에서 역할을 바꿀 수 있습니다.</Notice>;
  // 의뢰인 프로필이 비어 있으면(이름이 없으면) 프로필 화면으로 보냈다가 돌아옵니다. (1번 명세)
  if (!viewer.name?.trim()) redirect(`/me/profile?next=${encodeURIComponent(next)}`);

  return <ProjectForm mode="create" action={createProject} today={today} cancelHref="/projects" />;
}

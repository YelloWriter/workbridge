import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/profile";
import { displayStatus } from "@/components/projects/model";
import { EstimatePanel } from "@/components/ai/estimate-panel";
import { parseEstimate, type UnitEstimate } from "@/components/ai/estimate-schema";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function AiEstimatePage({ params }: { params: Promise<{ projectId: string }> }) {
  return (
    <Suspense fallback={<Shell title="AI 단가 분석"><p className="text-sm text-slate-600">불러오고 있어요…</p></Shell>}>
      <AiEstimateContent params={params} />
    </Suspense>
  );
}

async function AiEstimateContent({ params }: { params: Promise<{ projectId: string }> }) {
  await connection();
  const { projectId } = await params;
  if (!uuidPattern.test(projectId)) notFound();
  if (!isSupabaseConfigured()) {
    return (
      <Shell title="AI 단가 분석" description="프로젝트 설명을 기능별 참고 견적으로 나눕니다.">
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm leading-7 text-amber-900">
          데이터베이스가 연결되지 않아 견적을 저장할 수 없습니다. 연결한 뒤 다시 시도해 주세요.
        </p>
      </Shell>
    );
  }

  const next = `/ai-estimate/${projectId}`;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  const { data: profile } = await supabase.from("profiles").select("role, name").eq("id", user.id).maybeSingle();
  if (!profile?.role) redirect(`/onboarding/role?next=${encodeURIComponent(next)}`);
  if (profile.role !== "client") notFound();
  if (!profile.name?.trim()) redirect(`/me/profile?next=${encodeURIComponent(next)}`);

  const { data: project, error } = await supabase
    .from("projects")
    .select("id, client_id, title, description, budget, status, recruit_start_at, recruit_end_at")
    .eq("id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error("프로젝트를 불러오지 못했습니다.");
  if (!project || project.client_id !== user.id) notFound();

  const { data: row, error: estimateError } = await supabase
    .from("ai_estimates")
    .select("items, total_amount, created_at")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (estimateError) throw new Error("견적을 불러오지 못했습니다.");

  const parsed = row ? parseEstimate({ items: row.items, total_amount: Number(row.total_amount) }) : null;
  const estimate: UnitEstimate | null = parsed?.ok ? parsed.value : null;
  const broken = Boolean(row && !estimate);
  const budget = Number(project.budget);
  const open = (project.status === "scheduled" || project.status === "recruiting")
    && displayStatus(project.status, project.recruit_start_at, project.recruit_end_at) !== "closed";

  let applicantCount = 0;
  if (open) {
    const { data: counts } = await supabase.rpc("project_applicant_counts", { p_project_ids: [projectId] });
    applicantCount = Number((counts as { applicant_count?: number }[] | null)?.[0]?.applicant_count ?? 0);
  }
  const canApply = open && applicantCount === 0;
  const lockMessage = !open
    ? "모집이 끝났거나 계약이 진행 중이면 예산을 바꿀 수 없습니다. 참고 견적은 그대로 볼 수 있습니다."
    : "지원자가 있어서 예산은 바꿀 수 없습니다. 참고 견적은 그대로 볼 수 있습니다.";

  const createdAt = row?.created_at
    ? new Date(row.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    : null;

  return (
    <Shell title="AI 단가 분석" description="기능 이름, 설명, 예상 단가, 산정 근거와 전체 총액을 보여 줍니다. 계약 금액이 아닙니다.">
      <p className="mb-6 text-sm text-slate-600">
        <Link href={`/projects/${project.id}`} className="font-semibold text-teal-800 underline">{project.title}</Link>
        <span> · </span>
        <Link href={`/projects/${project.id}/edit`} className="underline">프로젝트 수정</Link>
      </p>
      {broken && (
        <p role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          저장된 견적을 읽지 못했습니다. 빠진 칸이나 이상한 금액이 있습니다. 다시 시도해 주세요.
        </p>
      )}
      <EstimatePanel
        projectId={project.id}
        description={project.description}
        budget={Number.isFinite(budget) ? budget : 0}
        estimate={estimate}
        createdAt={createdAt}
        canApply={canApply}
        lockMessage={lockMessage}
        unreadable={broken}
      />
    </Shell>
  );
}

function Shell({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:py-14">
      <p className="mb-2 text-sm font-semibold text-teal-700">WorkBridge</p>
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      {description && <p className="mt-3 max-w-3xl text-slate-600">{description}</p>}
      <div className="mt-8">{children}</div>
    </main>
  );
}

import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/profile";
import { AgreementActions } from "@/components/contracts/agreement-actions";

const statusLabel = {
  negotiating: "금액 합의 중",
  signing: "서명 중",
  signed: "체결",
  cancelled: "취소",
} as const;

export default function ContractsPage() {
  return (
    <Suspense fallback={<Shell title="계약 목록"><p className="text-sm text-slate-600">불러오고 있어요…</p></Shell>}>
      <ContractsContent />
    </Suspense>
  );
}

async function ContractsContent() {
  await connection();
  if (!isSupabaseConfigured()) {
    return (
      <Shell title="계약 목록" description="내가 당사자인 계약과, 아직 동의가 필요한 금액을 봅니다.">
        <Notice>데이터베이스가 연결되지 않아 계약을 불러올 수 없습니다.</Notice>
      </Shell>
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/contracts");
  const { data: profile } = await supabase.from("profiles").select("role, name").eq("id", user.id).maybeSingle();
  if (!profile?.role) redirect("/onboarding/role?next=/contracts");
  if (!profile.name?.trim()) redirect("/me/profile?next=/contracts");

  const [{ data: contracts, error: contractError }, { data: accepted, error: applicationError }] = await Promise.all([
    supabase.from("contracts")
      .select("id, project_id, application_id, client_id, freelancer_id, agreed_amount, status, start_date, end_date, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("applications")
      .select("id, project_id, freelancer_id, accepted_agreed_amount, proposed_days")
      .eq("status", "accepted")
      .is("deleted_at", null),
  ]);
  if (contractError || applicationError) throw new Error("계약을 불러오지 못했습니다.");

  const rows = contracts ?? [];
  const contracted = new Set(rows.map((row) => row.application_id));
  const pending = (accepted ?? []).filter((row) => !contracted.has(row.id));
  const projectIds = [...new Set([...rows.map((row) => row.project_id), ...pending.map((row) => row.project_id)])];
  const { data: projects } = projectIds.length
    ? await supabase.from("projects").select("id, title").in("id", projectIds)
    : { data: [] };
  const titles = new Map((projects ?? []).map((project) => [project.id, project.title as string]));

  return (
    <Shell title="계약 목록" description="체결된 계약서는 여기서 언제든 다시 볼 수 있습니다. 합의 금액은 의뢰인이 수락할 때 입력한 금액입니다.">
      {pending.length > 0 && (
        <section className="mb-8 space-y-3">
          <h2 className="text-lg font-semibold">동의를 기다리는 금액</h2>
          {pending.map((row) => {
            const mine = row.freelancer_id === user.id;
            const amount = Number(row.accepted_agreed_amount);
            return (
              <article key={row.id} className="rounded-xl border border-slate-200 p-5">
                <h3 className="font-semibold">{titles.get(row.project_id) ?? "프로젝트"}</h3>
                <p className="mt-2 text-sm text-slate-700">합의 금액 {Number.isFinite(amount) ? won(amount) : "확인 필요"} · {row.proposed_days}일</p>
                {mine ? (
                  <>
                    <p className="mt-2 text-sm leading-6 text-slate-600">의뢰인이 수락 화면에서 입력한 금액입니다. 동의하면 계약서가 만들어지고, 거부하면 이 지원만 거절됩니다.</p>
                    <AgreementActions applicationId={row.id} />
                  </>
                ) : (
                  <p className="mt-3 text-sm text-slate-600">프리랜서가 이 금액에 동의하거나 거부할 차례입니다. <Link className="underline" href={`/projects/${row.project_id}/applicants`}>지원자 관리</Link></p>
                )}
              </article>
            );
          })}
        </section>
      )}

      {rows.length === 0 ? (
        <Notice>{pending.length ? "아직 만들어진 계약서는 없습니다." : "진행 중인 합의나 계약이 없습니다."}</Notice>
      ) : (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">내 계약서</h2>
          {rows.map((row) => (
            <article key={row.id} className="rounded-xl border border-slate-200 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold">{titles.get(row.project_id) ?? "프로젝트"}</h3>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-800">{statusLabel[row.status as keyof typeof statusLabel] ?? row.status}</span>
              </div>
              <p className="mt-2 text-sm text-slate-700">{won(Number(row.agreed_amount))} · {formatDay(row.start_date)} ~ {formatDay(row.end_date)}</p>
              <Link href={`/contracts/${row.id}`} className="mt-4 inline-flex text-sm font-semibold text-teal-800 underline">계약서 보기</Link>
            </article>
          ))}
        </section>
      )}
    </Shell>
  );
}

function won(amount: number) {
  if (!Number.isFinite(amount)) return "금액 확인 필요";
  return `${amount.toLocaleString("ko-KR")}원`;
}

function formatDay(value: string | null) {
  if (!value) return "기간 미정";
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${year}.${month}.${day}.`;
}

function Shell({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-10 sm:py-14">
      <p className="mb-2 text-sm font-semibold text-teal-700">WorkBridge</p>
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      {description && <p className="mt-3 text-slate-600">{description}</p>}
      <div className="mt-8">{children}</div>
    </main>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm leading-7 text-slate-700">{children}</p>;
}

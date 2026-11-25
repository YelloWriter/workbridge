import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/profile";
import { SignForm } from "@/components/contracts/sign-form";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Shell title="계약서"><p className="text-sm text-slate-600">불러오고 있어요…</p></Shell>}>
      <ContractContent params={params} />
    </Suspense>
  );
}

async function ContractContent({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();
  if (!isSupabaseConfigured()) {
    return <Shell title="계약서"><Notice>데이터베이스가 연결되지 않아 계약서를 불러올 수 없습니다.</Notice></Shell>;
  }

  const next = `/contracts/${id}`;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  const { data: profile } = await supabase.from("profiles").select("role, name").eq("id", user.id).maybeSingle();
  if (!profile?.role) redirect(`/onboarding/role?next=${encodeURIComponent(next)}`);
  if (!profile.name?.trim()) redirect(`/me/profile?next=${encodeURIComponent(next)}`);

  const { data: contract, error } = await supabase.from("contracts")
    .select("id, project_id, client_id, freelancer_id, agreed_amount, status, client_signed_at, freelancer_signed_at, start_date, end_date")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error("계약서를 불러오지 못했습니다.");
  if (!contract) {
    return (
      <Shell title="계약서">
        <Notice>이 계약을 볼 수 없습니다.</Notice>
        <Link href="/contracts" className="mt-4 inline-flex text-sm text-teal-800 underline">계약 목록</Link>
      </Shell>
    );
  }

  const [{ data: project }, { data: people }] = await Promise.all([
    supabase.from("projects").select("id, title").eq("id", contract.project_id).maybeSingle(),
    supabase.from("profiles").select("id, name, company_name").in("id", [contract.client_id, contract.freelancer_id]),
  ]);
  const byId = new Map((people ?? []).map((person) => [person.id, person]));
  const client = byId.get(contract.client_id);
  const freelancer = byId.get(contract.freelancer_id);
  const mineIsClient = user.id === contract.client_id;
  const mySignedAt = mineIsClient ? contract.client_signed_at : contract.freelancer_signed_at;
  const signed = contract.status === "signed";

  return (
    <Shell title="계약서" description="이 내용은 참고용 계약서입니다. 플랫폼은 서명하지 않습니다.">
      <p className="mb-6 text-sm"><Link href="/contracts" className="text-teal-800 underline">계약 목록</Link></p>
      <article className="rounded-2xl border border-slate-200 p-5 sm:p-7">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Fact label="프로젝트명" value={project?.title ?? "프로젝트"} />
          <Fact label="합의 금액" value={won(Number(contract.agreed_amount))} />
          <Fact label="시작일" value={formatDay(contract.start_date)} />
          <Fact label="종료일" value={formatDay(contract.end_date)} />
          <Fact label="의뢰인" value={personLabel(client?.name, client?.company_name)} />
          <Fact label="프리랜서" value={personLabel(freelancer?.name, null)} />
          <Fact label="의뢰인 서명" value={signedAt(contract.client_signed_at)} />
          <Fact label="프리랜서 서명" value={signedAt(contract.freelancer_signed_at)} />
        </dl>
        {contract.status === "signing" && !mySignedAt && (
          <SignForm contractId={contract.id} roleLabel={mineIsClient ? "의뢰인" : "프리랜서"} />
        )}
        {contract.status === "signing" && mySignedAt && (
          <p className="mt-6 text-sm text-slate-700">내 서명은 기록되었습니다. 상대방의 서명을 기다리고 있습니다.</p>
        )}
        {signed && (
          <div className="mt-6 space-y-3">
            <p className="text-sm font-semibold text-teal-900">양쪽 서명이 끝나 계약이 체결되었습니다.</p>
            <Link href={`/payments/${contract.id}`} className="inline-flex items-center justify-center rounded-lg bg-teal-800 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-900">
              결제 화면으로 이동
            </Link>
            <p className="text-xs leading-5 text-slate-500">의뢰인이 대금을 넣는 화면입니다. 결제가 끝나야 작업이 시작됩니다.</p>
          </div>
        )}
      </article>
    </Shell>
  );
}

function personLabel(name?: string | null, company?: string | null) {
  const who = name?.trim() || "이름 없음";
  return company?.trim() ? `${who} · ${company.trim()}` : who;
}

function signedAt(value: string | null) {
  if (!value) return "아직 서명하지 않음";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value));
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
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

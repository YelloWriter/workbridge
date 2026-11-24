import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ROLES } from "@/lib/constants";
import { completeRole } from "@/app/onboarding/actions";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, safeNext } from "@/lib/supabase/profile";

export default function RolePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  return (
    <Suspense fallback={<p className="p-8 text-center text-slate-500">역할 선택을 준비하고 있습니다.</p>}>
      <RoleContent searchParams={searchParams} />
    </Suspense>
  );
}

async function RoleContent({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  if (!isSupabaseConfigured()) {
    return <p className="p-8 text-center">Supabase 연결 정보가 아직 없습니다.</p>;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/onboarding/role?next=${encodeURIComponent(next)}`)}`);

  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (data?.role) redirect(next);

  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-semibold text-slate-900">어떻게 사용할까요?</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        의뢰인은 프로젝트를 올리고, 프리랜서는 프로젝트에 지원합니다. 나중에 프로필에서 바꿀 수 있습니다.
      </p>
      {params.error && (
        <p className="mt-4 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
          역할을 저장하지 못했습니다. 다시 선택해 주세요.
        </p>
      )}
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {ROLES.map((role) => (
          <form key={role.value} action={completeRole}>
            <input type="hidden" name="role" value={role.value} />
            <input type="hidden" name="next" value={next} />
            <button
              type="submit"
              className="h-full w-full rounded-2xl border border-slate-200 p-6 text-left hover:border-slate-900"
            >
              <span className="block text-lg font-semibold text-slate-900">{role.label}</span>
              <span className="mt-2 block text-sm leading-6 text-slate-600">
                {role.value === "client"
                  ? "필요한 작업을 등록하고 지원자를 고릅니다."
                  : "올려진 프로젝트에 제안하고 작업을 진행합니다."}
              </span>
            </button>
          </form>
        ))}
      </div>
    </section>
  );
}

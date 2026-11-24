import { Suspense } from "react";
import { ROLES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { PUBLIC_PROFILE_COLUMNS, isSupabaseConfigured, type Profile } from "@/lib/supabase/profile";

export default function UserPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="p-8 text-center text-slate-500">프로필을 준비하고 있습니다.</p>}>
      <UserContent params={params} />
    </Suspense>
  );
}

async function UserContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isSupabaseConfigured()) {
    return <p className="mx-auto max-w-2xl p-8">Supabase 연결 정보가 아직 없습니다.</p>;
  }

  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select(PUBLIC_PROFILE_COLUMNS).eq("id", id).maybeSingle();
  const profile = data as Profile | null;
  if (!profile?.role) {
    return <p className="mx-auto max-w-2xl p-8">프로필을 찾을 수 없습니다.</p>;
  }

  const roleLabel = ROLES.find((role) => role.value === profile.role)?.label ?? profile.role;
  const rows =
    profile.role === "client"
      ? [
          ["회사", profile.company_name],
          ["업종", profile.business_field],
          ["웹사이트", profile.website],
        ]
      : [
          ["분야", profile.category],
          ["기술", profile.skills?.join(", ")],
          ["경력", profile.career_years == null ? null : `${profile.career_years}년`],
          ["시간당 금액", profile.hourly_rate == null ? null : `${profile.hourly_rate.toLocaleString("ko-KR")}원`],
          ["포트폴리오", profile.portfolio_url],
        ];

  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-12">
      <div className="flex items-center gap-4">
        {profile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatar_url} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            사진
          </span>
        )}
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{profile.name || "이름 없음"}</h1>
          <p className="text-sm text-slate-600">{roleLabel}</p>
        </div>
      </div>
      {profile.bio && <p className="mt-6 whitespace-pre-wrap text-sm leading-7 text-slate-700">{profile.bio}</p>}
      <dl className="mt-6 space-y-3">
        {rows.map(([label, value]) =>
          value ? (
            <div key={label}>
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="text-sm text-slate-800">{value}</dd>
            </div>
          ) : null,
        )}
      </dl>
      {/* 5번 담당: 평균 별점과 리뷰 목록 컴포넌트를 이 자리에 넣어 주세요. userId 를 넘기면 됩니다. */}
      <div data-slot="public-reviews" data-user-id={profile.id} className="mt-10" />
    </section>
  );
}

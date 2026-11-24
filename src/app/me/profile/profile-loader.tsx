"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ProfileForm } from "@/app/me/profile/profile-form";
import { createClient } from "@/lib/supabase/client";
import { PUBLIC_PROFILE_COLUMNS, type Profile } from "@/lib/supabase/profile";

export function ProfileLoader({ next }: { next: string }) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        const back = `/me/profile${next ? `?next=${encodeURIComponent(next)}` : ""}`;
        router.replace(`/login?next=${encodeURIComponent(back)}`);
        return;
      }
      const { data: row, error } = await supabase
        .from("profiles")
        .select(PUBLIC_PROFILE_COLUMNS)
        .eq("id", data.user.id)
        .maybeSingle();
      if (error || !row) {
        setMessage("프로필을 불러오지 못했습니다.");
        return;
      }
      setEmail(data.user.email ?? "");
      setProfile(row as Profile);
    });
  }, [next, router]);

  if (message) return <p className="mx-auto max-w-2xl p-8">{message}</p>;
  if (!profile) return <p className="p-8 text-center text-slate-500">프로필을 준비하고 있습니다.</p>;

  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold text-slate-900">내 프로필</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        이름만 있어도 프로젝트 등록과 지원을 이어갈 수 있습니다. 저장 후 원래 하던 화면이 있으면 그곳으로 돌아갑니다.
      </p>
      <ProfileForm profile={profile} email={email} next={next} />
    </section>
  );
}

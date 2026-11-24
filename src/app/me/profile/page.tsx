import { Suspense } from "react";
import { ProfileLoader } from "@/app/me/profile/profile-loader";
import { safeNext } from "@/lib/supabase/profile";

export default function ProfilePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return (
    <Suspense fallback={<p className="p-8 text-center text-slate-500">프로필을 준비하고 있습니다.</p>}>
      <ProfileContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ProfileContent({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  return <ProfileLoader next={safeNext(params.next, "")} />;
}

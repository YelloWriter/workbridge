import Link from "next/link";
import { Suspense } from "react";
import { signIn } from "@/app/(auth)/actions";
import { AuthForm } from "@/app/(auth)/auth-form";
import { safeNext } from "@/lib/supabase/profile";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  return (
    <Suspense fallback={<p className="p-8 text-center text-slate-500">로그인 화면을 준비하고 있습니다.</p>}>
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}

async function LoginContent({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  return (
    <AuthForm
      title="로그인"
      description="이메일과 비밀번호로 들어옵니다."
      action={signIn}
      submitLabel="로그인"
      next={next}
      extraMessage={params.error === "google" ? "구글 로그인에 실패했습니다. 이메일로 로그인해 주세요." : undefined}
      footer={
        <p>
          계정이 없나요?{" "}
          <Link className="underline" href={`/signup?next=${encodeURIComponent(next)}`}>
            회원가입
          </Link>
        </p>
      }
    />
  );
}

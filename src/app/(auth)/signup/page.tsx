import Link from "next/link";
import { Suspense } from "react";
import { signUp } from "@/app/(auth)/actions";
import { AuthForm } from "@/app/(auth)/auth-form";
import { safeNext } from "@/lib/supabase/profile";

export default function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return (
    <Suspense fallback={<p className="p-8 text-center text-slate-500">회원가입 화면을 준비하고 있습니다.</p>}>
      <SignupContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SignupContent({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const next = safeNext(params.next);
  return (
    <AuthForm
      title="회원가입"
      description="이메일과 비밀번호만 있으면 됩니다. 역할은 가입 다음에 고릅니다."
      action={signUp}
      submitLabel="회원가입"
      next={next}
      showConfirm
      footer={
        <p>
          이미 계정이 있나요?{" "}
          <Link className="underline" href={`/login?next=${encodeURIComponent(next)}`}>
            로그인
          </Link>
        </p>
      }
    />
  );
}

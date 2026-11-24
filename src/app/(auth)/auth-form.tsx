"use client";

import { useActionState, type ReactNode } from "react";
import { signInWithGoogle, type AuthState } from "@/app/(auth)/actions";

export function AuthForm({
  title,
  description,
  action,
  submitLabel,
  next,
  showConfirm = false,
  extraMessage,
  footer,
}: {
  title: string;
  description: string;
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
  submitLabel: string;
  next: string;
  showConfirm?: boolean;
  extraMessage?: string;
  footer: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <section className="mx-auto w-full max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      <form action={formAction} className="mt-8 space-y-4">
        <input type="hidden" name="next" value={next} />
        <label className="block text-sm font-medium text-slate-800">
          이메일
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm font-medium text-slate-800">
          비밀번호
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={showConfirm ? "new-password" : "current-password"}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        {showConfirm && (
          <label className="block text-sm font-medium text-slate-800">
            비밀번호 확인
            <input
              name="confirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
        )}
        {(state?.message || extraMessage) && (
          <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
            {state?.message ?? extraMessage}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "처리 중…" : submitLabel}
        </button>
      </form>
      <form action={signInWithGoogle} className="mt-3">
        <input type="hidden" name="next" value={next} />
        <button
          type="submit"
          className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-800"
        >
          구글로 계속하기
        </button>
      </form>
      <div className="mt-6 text-sm text-slate-600">{footer}</div>
    </section>
  );
}

"use client";

import { useActionState } from "react";
import type { FormState } from "./model";

// 서버 동작 하나를 버튼으로 실행합니다. (모집 마감, 삭제, 북마크)
// confirmText 가 있으면 실행 전에 한 번 더 물어봅니다.
export function ActionButton({
  action, label, pendingLabel, confirmText, className, ariaPressed,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  label: string;
  pendingLabel?: string;
  confirmText?: string;
  className: string;
  ariaPressed?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (confirmText && !window.confirm(confirmText)) event.preventDefault();
      }}
      className="flex flex-col gap-1"
    >
      <button type="submit" disabled={pending} aria-pressed={ariaPressed} className={className}>
        {pending ? (pendingLabel ?? "처리하고 있어요…") : label}
      </button>
      {state.error && <span role="alert" className="max-w-xs text-xs text-red-700">{state.error}</span>}
      {state.message && <span role="status" className="max-w-xs text-xs text-teal-800">{state.message}</span>}
    </form>
  );
}

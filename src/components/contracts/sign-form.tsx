"use client";

import { useActionState } from "react";
import { signContract, type ContractActionState } from "@/app/contracts/actions";

export function SignForm({ contractId, roleLabel }: { contractId: string; roleLabel: string }) {
  const [state, action, pending] = useActionState(signContract, {} as ContractActionState);
  return (
    <form action={action} className="mt-6 space-y-4 rounded-xl border border-slate-200 p-5">
      <input type="hidden" name="contract_id" value={contractId} />
      <label className="flex items-start gap-3 text-sm leading-6">
        <input type="checkbox" name="confirm" required className="mt-1" />
        <span>{roleLabel}으로서 프로젝트명, 합의 금액, 기간, 양쪽 정보가 맞습니다. 서명합니다.</span>
      </label>
      <button type="submit" disabled={pending} className="inline-flex items-center justify-center rounded-lg bg-teal-800 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-900 disabled:cursor-wait disabled:opacity-50">
        {pending ? "서명하고 있어요…" : "서명"}
      </button>
      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
    </form>
  );
}

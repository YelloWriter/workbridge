"use client";

import { useActionState } from "react";
import { agreeToAmount, declineAmount, type ContractActionState } from "@/app/contracts/actions";

const agreeClass = "inline-flex items-center justify-center rounded-lg bg-teal-800 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-900 disabled:cursor-wait disabled:opacity-50";
const declineClass = "inline-flex items-center justify-center rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50";

export function AgreementActions({ applicationId }: { applicationId: string }) {
  const [agreeState, agree, agreeing] = useActionState(agreeToAmount, {} as ContractActionState);
  const [declineState, decline, declining] = useActionState(declineAmount, {} as ContractActionState);
  const pending = agreeing || declining;
  return (
    <div className="mt-4 space-y-3">
      <form action={agree}>
        <input type="hidden" name="application_id" value={applicationId} />
        <button type="submit" disabled={pending} className={agreeClass}>{agreeing ? "동의하고 있어요…" : "이 금액에 동의"}</button>
        {agreeState.error && <p role="alert" className="mt-2 text-sm text-red-700">{agreeState.error}</p>}
      </form>
      <form action={decline}>
        <input type="hidden" name="application_id" value={applicationId} />
        <button type="submit" disabled={pending} className={declineClass}>{declining ? "거부하고 있어요…" : "이 금액 거부"}</button>
        {declineState.error && <p role="alert" className="mt-2 text-sm text-red-700">{declineState.error}</p>}
      </form>
    </div>
  );
}

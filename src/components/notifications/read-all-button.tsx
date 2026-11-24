"use client";
import { useFormStatus } from "react-dom";
export function ReadAllButton() {
  const { pending } = useFormStatus();
  return <button disabled={pending} className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">{pending ? "읽음 처리 중…" : "모두 읽음"}</button>;
}

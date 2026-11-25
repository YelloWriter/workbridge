"use client";

export default function ContractError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-16">
      <p className="mb-2 text-sm font-semibold text-teal-700">WorkBridge</p>
      <h1 className="text-2xl font-bold">계약서를 불러오지 못했습니다</h1>
      <p className="mt-3 text-slate-600">잠시 후 다시 시도해 주세요.</p>
      <button type="button" onClick={reset} className="mt-6 rounded-lg bg-teal-800 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-900">다시 시도</button>
    </main>
  );
}

"use client";

// 조회 오류가 났을 때 보여 주는 화면. 오류 원문은 화면에 내보내지 않습니다.
export function RetryError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-16">
      <p className="mb-2 text-sm font-semibold text-teal-700">WorkBridge</p>
      <h1 className="text-2xl font-bold">불러오지 못했습니다</h1>
      <p className="mt-3 text-slate-600">잠시 후 다시 시도해 주세요. 계속되면 데이터베이스 설정(0200~0202 실행 여부)을 확인해 주세요.</p>
      <button onClick={reset} className="mt-6 rounded-lg bg-teal-800 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-900">다시 시도</button>
    </main>
  );
}

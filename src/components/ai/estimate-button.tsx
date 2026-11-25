"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const buttonClass =
  "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-background px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 2번 등록·수정 폼의 data-slot="ai-estimate-button" 안에 넣는 버튼.
 * 수정 주소(/projects/[id]/edit)에서는 결과 화면으로 이동한다.
 * 아직 번호가 없는 등록 화면에서는 저장 후에 쓰라고 안내하고 눌리지 않는다.
 */
export function AiEstimateButton({ projectId }: { projectId?: string }) {
  const path = usePathname();
  const fromPath = path.match(/^\/projects\/([0-9a-f-]{36})\/edit\/?$/i)?.[1];
  const id = projectId ?? fromPath;

  if (!id || !uuidPattern.test(id)) {
    return (
      <button
        type="button"
        disabled
        title="프로젝트를 등록한 뒤, 수정 화면에서 이 버튼을 눌러 주세요."
        className={buttonClass}
      >
        AI 단가 분석
      </button>
    );
  }

  return (
    <Link href={`/ai-estimate/${id}`} className={buttonClass}>
      AI 단가 분석
    </Link>
  );
}

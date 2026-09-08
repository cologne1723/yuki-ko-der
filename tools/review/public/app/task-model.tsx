import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { OperationInput } from "translation-audit/operations/run";
import { reviewApi } from "./client.ts";
import { taskKeys } from "./task-queries.ts";

export const taskLabels: Record<string, string> = {
  setup: "원문 다운로드",
  "audit-problems": "저장 원문 검사",
  "verify-problems": "현재 원문과 비교",
  "validate-problems": "번역 검증",
  "lint-problems": "문서 형식 검사",
  "validate-ui": "UI 번역 검증",
  "audit-ui-pages": "페이지 번역 범위 검사",
  "audit-ui-contexts": "사용 문맥 검사",
  "audit-translations": "HTML 번역 검사",
  "convert-problem": "HTML → MDX 미리보기",
  running: "실행 중",
  cancelling: "중단 중",
  cancelled: "중단됨",
  interrupted: "서버 종료로 중단됨",
  completed: "작업 종료",
  failed: "실패",
};

export const operations = Object.keys(taskLabels).slice(
  0,
  10,
) as OperationInput["operation"][];

export { active } from "./task-state.ts";

export function useStartTask(onStarted: (id: string) => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: OperationInput) => reviewApi.startTask(input),
    onSuccess: (task) => {
      onStarted(task.id);
      void client.invalidateQueries({ queryKey: taskKeys.list });
    },
  });
}

export async function invalidateReviewData(
  client: ReturnType<typeof useQueryClient>,
) {
  await client.invalidateQueries({
    predicate: (query) =>
      typeof query.queryKey[0] === "string" &&
      (query.queryKey[0].startsWith("/api/problems") ||
        query.queryKey[0].startsWith("/api/ui")),
  });
}

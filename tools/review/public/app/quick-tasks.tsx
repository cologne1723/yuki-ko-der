import { Button, Group, Select, Text } from "@mantine/core";
import { useState } from "react";
import type { OperationInput } from "translation-audit/operations/run";
import { Failure } from "./shared.tsx";
import { TaskDrawer } from "./task-drawer.tsx";
import { taskLabels, useStartTask } from "./task-model.tsx";

export function QuickTasks({
  kind,
  number,
}: {
  kind: "problem" | "ui";
  number?: number;
}) {
  const [id, setId] = useState<string>();
  const [operation, setOperation] = useState<string | null>(
    kind === "problem" ? "audit-problems" : "validate-ui",
  );
  const start = useStartTask(setId);
  const choices =
    kind === "problem"
      ? [
          "setup",
          "audit-problems",
          "verify-problems",
          "validate-problems",
          "lint-problems",
          "convert-problem",
        ]
      : ["setup", "validate-ui", "audit-ui-pages", "audit-ui-contexts"];
  return (
    <>
      <Group align="end">
        <Select
          label="검사 작업"
          value={operation}
          onChange={setOperation}
          data={choices.map((value) => ({ value, label: taskLabels[value] }))}
        />
        <Button
          variant="light"
          loading={start.isPending}
          onClick={() =>
            start.mutate({
              operation: operation as OperationInput["operation"],
              ...(operation === "setup"
                ? {
                    selection: kind === "problem" ? "problems" : "pages",
                    refresh: true,
                  }
                : {}),
              ...(number
                ? operation === "convert-problem"
                  ? { problemNo: number }
                  : { problems: String(number) }
                : {}),
            })
          }
        >
          실행
        </Button>
        <Text size="xs" c="dimmed">
          저장된 번역으로 검사합니다.
        </Text>
      </Group>
      <Failure error={start.error} />
      <TaskDrawer id={id} onClose={() => setId(undefined)} onStarted={setId} />
    </>
  );
}

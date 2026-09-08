import { Alert, Button, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { reviewApi } from "./client.ts";
import { OperationForm } from "./operation-form.tsx";
import { Settings } from "./settings.tsx";
import {
  Empty,
  Failure,
  Pending,
  useApi,
  useDocumentTitle,
} from "./shared.tsx";
import { TaskDrawer } from "./task-drawer.tsx";
import { active, taskLabels } from "./task-model.tsx";
import { tasksQueryOptions } from "./task-queries.ts";

export function Tools() {
  useDocumentTitle("도구와 설정");
  const [id, setId] = useLocalStorage<string | undefined>({
    key: "review-last-task",
    defaultValue: undefined,
  });
  const [opened, setOpened] = useState(false);
  const recent = useQuery(tasksQueryOptions());
  const recovery = useApi("/api/tasks/recovery", (signal) =>
    reviewApi.recovery(signal),
  );
  const selectTask = (id: string) => {
    setId(id);
    setOpened(true);
  };
  return (
    <Stack maw={1100} mx="auto">
      <Title order={1}>도구와 설정</Title>
      <Failure error={recovery.error} retry={() => void recovery.refetch()} />
      {recovery.data?.map((w) => (
        <Alert key={w.file} color="orange" title="작업 기록 확인 필요">
          {w.file}: {w.error}. 원래 파일은 보존되어 있습니다.
        </Alert>
      ))}
      <Text c="dimmed">
        다운로드와 검사는 저장된 번역을 사용합니다. 편집 중인 내용은 먼저
        저장하세요.
      </Text>
      <OperationForm
        selectTask={selectTask}
        running={recent.data?.some((t) => active(t.status)) ?? false}
      />
      <Paper withBorder p="lg">
        <Stack>
          <Group justify="space-between">
            <Title order={2}>최근 작업</Title>
            <Button variant="default" onClick={() => void recent.refetch()}>
              목록 새로고침
            </Button>
          </Group>
          <Failure error={recent.error} retry={() => void recent.refetch()} />
          {recent.isPending ? (
            <Pending />
          ) : recent.data?.length ? (
            recent.data.map((task) => (
              <Button
                key={task.id}
                variant="light"
                justify="space-between"
                onClick={() => selectTask(task.id)}
              >
                {taskLabels[task.input.operation]} · {taskLabels[task.status]} ·{" "}
                {new Date(task.startedAt).toLocaleString()}
              </Button>
            ))
          ) : (
            <Empty>아직 실행한 작업이 없습니다.</Empty>
          )}
          {id && !opened && (
            <Button variant="subtle" onClick={() => setOpened(true)}>
              마지막 작업 열기
            </Button>
          )}
        </Stack>
      </Paper>
      <Settings />
      <TaskDrawer
        id={opened ? id : undefined}
        onClose={() => setOpened(false)}
        onStarted={selectTask}
      />
    </Stack>
  );
}

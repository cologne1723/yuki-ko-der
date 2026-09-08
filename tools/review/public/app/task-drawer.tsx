import {
  Accordion,
  Alert,
  Anchor,
  Badge,
  Button,
  Code,
  Drawer,
  Group,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { reviewApi } from "./client.ts";
import { Failure, Pending, ReviewBadge } from "./shared.tsx";
import {
  active,
  invalidateReviewData,
  taskLabels,
  useStartTask,
} from "./task-model.tsx";
import { taskQueryOptions } from "./task-queries.ts";

export function TaskDrawer({
  id,
  onClose,
  onStarted,
}: {
  id?: string;
  onClose: () => void;
  onStarted: (id: string) => void;
}) {
  const query = useQuery(taskQueryOptions(id));
  const client = useQueryClient();
  const completed = useRef<string | undefined>(undefined);
  useEffect(() => {
    const task = query.data;
    if (task && !active(task.status) && completed.current !== task.id) {
      completed.current = task.id;
      void invalidateReviewData(client);
    }
  }, [query.data, client]);
  const action = useMutation({
    mutationFn: async (suffix: "cancel" | "convert"): Promise<void> => {
      await (suffix === "cancel"
        ? reviewApi.cancelTask(id!)
        : reviewApi.convertTask(id!));
    },
    onSuccess: async () => {
      await query.refetch();
      await invalidateReviewData(client);
    },
  });
  const start = useStartTask(onStarted);
  const task = query.data;
  const items = task?.result?.items ?? task?.progress ?? [];
  const failed = items.filter(
    (i) => i.status === "failed" || i.status === "review-required",
  );
  return (
    <Drawer
      opened={!!id}
      onClose={onClose}
      position="right"
      size="xl"
      title="작업 결과"
      closeButtonProps={{ "aria-label": "작업 결과 닫기" }}
    >
      <Stack>
        <Failure error={query.error} retry={() => void query.refetch()} />
        <Failure error={action.error ?? start.error} />
        {query.isPending ? (
          <Pending />
        ) : (
          task && (
            <>
              <Title order={2}>{taskLabels[task.input.operation]}</Title>
              <Group>
                <Badge color={task.status === "failed" ? "red" : "blue"}>
                  {taskLabels[task.status]}
                </Badge>
                <Text>
                  {items.length}개 결과 · 확인 필요 {failed.length}개
                </Text>
              </Group>
              {task.error && <Alert color="red">{task.error}</Alert>}
              {task.stale && (
                <Alert color="orange">
                  입력 번역이 변경되어 오래된 결과입니다. 다시 실행하세요.
                </Alert>
              )}
              <Group>
                {active(task.status) ? (
                  <Button
                    disabled={task.status === "cancelling"}
                    loading={action.isPending}
                    onClick={() => action.mutate("cancel")}
                  >
                    중단
                  </Button>
                ) : (
                  <Button
                    loading={start.isPending}
                    onClick={() => start.mutate(task.input)}
                  >
                    다시 실행
                  </Button>
                )}
                {!active(task.status) &&
                  failed.length > 0 &&
                  failed.every((i) => /^\d+$/.test(i.id)) && (
                    <Button
                      variant="light"
                      loading={start.isPending}
                      onClick={() =>
                        start.mutate({
                          ...task.input,
                          problems: failed.map((i) => i.id).join(","),
                        })
                      }
                    >
                      확인 필요 항목 다시 검사
                    </Button>
                  )}
              </Group>
              <Table.ScrollContainer minWidth={500}>
                <Table striped withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>항목</Table.Th>
                      <Table.Th>검사 결과</Table.Th>
                      <Table.Th>검수 상태</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {items.map((item, index) => (
                      <Table.Tr key={`${item.id}:${index}`}>
                        <Table.Td>
                          {/^\d+$/.test(item.id) ? (
                            <Anchor
                              component={Link}
                              to={`/?problem=${item.id}`}
                              onClick={onClose}
                            >
                              {item.id}
                            </Anchor>
                          ) : item.location ||
                            /^[\w-]+\.json$/.test(item.id) ? (
                            <Anchor
                              component={Link}
                              to={`/ui#${encodeURIComponent(item.location?.dictionary ?? item.id)}:${item.location?.index ?? 0}`}
                              onClick={onClose}
                            >
                              {item.id}
                            </Anchor>
                          ) : (
                            item.id
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Text
                            size="sm"
                            c={item.status === "failed" ? "red" : undefined}
                          >
                            {item.message}
                          </Text>
                          {item.details != null && (
                            <Accordion>
                              <Accordion.Item value="details">
                                <Accordion.Control>
                                  검사 세부 결과
                                </Accordion.Control>
                                <Accordion.Panel>
                                  <Code block>
                                    {JSON.stringify(item.details, null, 2)}
                                  </Code>
                                </Accordion.Panel>
                              </Accordion.Item>
                            </Accordion>
                          )}
                        </Table.Td>
                        <Table.Td>
                          {item.reviewStatus ? (
                            <ReviewBadge status={item.reviewStatus} />
                          ) : /^\d+$/.test(item.id) ? (
                            <Text size="xs">기록 없음 · 다시 실행해 확인</Text>
                          ) : (
                            "—"
                          )}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
              {task.result?.artifact && (
                <>
                  <Title order={3}>변환된 MDX</Title>
                  <Code block style={{ maxHeight: 320, overflow: "auto" }}>
                    {task.result.artifact.content}
                  </Code>
                  <Group>
                    <Button
                      component="a"
                      href={`/api/tasks/${id}/artifact`}
                      variant="light"
                    >
                      MDX 다운로드
                    </Button>
                    {task.result.artifact.problemNo && (
                      <Button
                        disabled={!!task.stale || task.status !== "completed"}
                        loading={action.isPending}
                        onClick={() =>
                          modals.openConfirmModal({
                            title: "원본 HTML 교체",
                            children: (
                              <Text>
                                미리 본 MDX로 이 문제의 HTML 파일을 교체할까요?
                              </Text>
                            ),
                            labels: { confirm: "교체", cancel: "취소" },
                            onConfirm: () => action.mutate("convert"),
                          })
                        }
                      >
                        검증된 MDX로 원본 HTML 교체
                      </Button>
                    )}
                  </Group>
                </>
              )}
            </>
          )
        )}
      </Stack>
    </Drawer>
  );
}

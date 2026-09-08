import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Stack,
  Text,
} from "@mantine/core";
import { useDocumentTitle as useMantineDocumentTitle } from "@mantine/hooks";
import { type ReactNode } from "react";

export function Failure({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return error ? (
    <Alert color="red" title="작업을 완료하지 못했습니다" role="alert">
      <Stack gap="xs">
        <Text size="sm">
          {error instanceof Error ? error.message : String(error)}
        </Text>
        {retry && (
          <Button variant="light" color="red" onClick={retry}>
            다시 시도
          </Button>
        )}
      </Stack>
    </Alert>
  ) : null;
}

export function Pending() {
  return (
    <Group p="xl" role="status">
      <Loader size="sm" />
      <Text>불러오는 중…</Text>
    </Group>
  );
}

export const reviewLabels: Record<string, string> = {
  invalid: "문서 오류 · 수정 필요",
  approved: "승인됨",
  unreviewed: "미검수",
  machine: "기계 번역 · 미검수",
  draft: "초안 · 미검수",
  new: "새 문구",
  "needs-check": "문맥 확인 필요",
  deferred: "보류",
  excluded: "제외",
};

export function ReviewBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="light"
      color={
        status === "approved"
          ? "teal"
          : status === "needs-check"
            ? "red"
            : "orange"
      }
    >
      {reviewLabels[status] ?? status}
    </Badge>
  );
}

export function useDocumentTitle(title: string) {
  useMantineDocumentTitle(`${title} · 번역 검수`);
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <Text c="dimmed" p="xl">
      {children}
    </Text>
  );
}

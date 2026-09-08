import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useCallback, useRef } from "react";
import { useBeforeUnload, useBlocker } from "react-router-dom";

export function UnsavedGuard({
  dirty,
  pending = false,
}: {
  dirty: boolean;
  pending?: boolean;
}) {
  const needsGuard = useRef(dirty || pending);
  needsGuard.current = dirty || pending;
  const blocker = useBlocker(useCallback(() => needsGuard.current, []));
  useBeforeUnload(
    useCallback(
      (event) => {
        if (dirty || pending) {
          event.preventDefault();
          event.returnValue = "";
        }
      },
      [dirty, pending],
    ),
  );
  return (
    <Modal
      opened={blocker.state === "blocked"}
      onClose={() => blocker.state === "blocked" && blocker.reset()}
      title={pending ? "저장 중입니다" : "저장하지 않은 변경"}
      centered
    >
      <Stack>
        <Text>
          {pending
            ? "저장이 완료된 뒤 이동하세요."
            : "변경 내용을 버리고 이동할까요?"}
        </Text>
        <Group justify="flex-end">
          <Button
            variant="default"
            onClick={() => blocker.state === "blocked" && blocker.reset()}
          >
            계속 편집
          </Button>
          {!pending && (
            <Button
              color="red"
              onClick={() => blocker.state === "blocked" && blocker.proceed()}
            >
              변경 버리고 이동
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}

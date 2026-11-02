import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBeforeUnload, useBlocker } from "react-router-dom";

export function UnsavedGuard({
  dirty,
  pending = false,
  checkDirty,
}: {
  dirty: boolean;
  pending?: boolean;
  checkDirty?: () => Promise<boolean>;
}) {
  const needsGuard = useRef(dirty || pending);
  needsGuard.current = dirty || pending;
  const check = useRef(checkDirty);
  check.current = checkDirty;
  const [checkedDirty, setCheckedDirty] = useState(false);
  const blocker = useBlocker(
    useCallback(() => needsGuard.current || Boolean(check.current), []),
  );
  useEffect(() => {
    if (blocker.state !== "blocked") {
      setCheckedDirty(false);
      return;
    }
    if (needsGuard.current || !check.current) {
      setCheckedDirty(true);
      return;
    }
    let cancelled = false;
    // Keep the editor mounted while its native input is flushed. A clean draft
    // can continue without a discard prompt; failures preserve the draft.
    void check.current().then(
      (changed) => {
        if (cancelled) return;
        if (changed || needsGuard.current) setCheckedDirty(true);
        else blocker.proceed();
      },
      () => {
        if (!cancelled) setCheckedDirty(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [blocker.state, blocker.location?.key]);
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
      opened={blocker.state === "blocked" && (dirty || pending || checkedDirty)}
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

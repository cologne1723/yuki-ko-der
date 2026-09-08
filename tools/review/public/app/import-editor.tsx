import {
  Alert,
  Button,
  Code,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { modals } from "@mantine/modals";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { applyTranslations } from "translation-core/fixed-translations";
import type { ImportTask } from "../../src/ui-imports.ts";
import { reviewApi } from "./client.ts";
import { Preview } from "./preview.tsx";
import {
  Failure,
  Pending,
  ReviewBadge,
  UnsavedGuard,
  useApi,
} from "./shared.tsx";

export function ImportEditor({
  initial,
  next,
  collection,
  onDirty,
}: {
  onDirty: (value: boolean) => void;
  initial: ImportTask;
  next?: string;
  collection: string;
}) {
  const [saved, setSaved] = useState(initial);
  const [advance, setAdvance] = useState<string>();
  const form = useForm({ initialValues: { target: initial.target } });
  const target = form.values.target;
  const setTarget = (target: string) => {
    form.setValues({ target });
    form.resetDirty({ target });
  };
  const [context, setContext] = useState<string | null>("0");
  const client = useQueryClient();
  const [, setParams] = useSearchParams();
  const location = saved.locations[Number(context ?? 0)];
  const snapshot = useApi(
    `/api/ui/imports/${saved.id}/snapshot/${location?.collectionId}/${location?.occurrenceId}`,
    (signal) =>
      reviewApi.snapshot(
        saved.id,
        location?.collectionId ?? "",
        location?.occurrenceId ?? "",
        signal,
      ),
    !!location,
  );
  const preview = useMemo(() => {
    if (!snapshot.data) return "";
    const doc = new DOMParser().parseFromString(
      snapshot.data.html,
      "text/html",
    );
    if (location?.verified && location.selector)
      applyTranslations(doc, [
        {
          source: saved.source,
          target,
          selector: location.selector,
          attribute: location.attribute,
          variables: saved.variables,
        },
      ]);
    return doc.documentElement.outerHTML;
  }, [snapshot.data, location, saved, target]);
  const save = useMutation({
    mutationFn: ({
      action,
    }: {
      action: Parameters<typeof reviewApi.saveImport>[1]["action"];
      next?: string;
    }) =>
      reviewApi.saveImport(saved.id, {
        action,
        target,
        revision: saved.revision,
      }),
    onSuccess: async (data, request) => {
      const current = data.tasks.find((t) => t.id === saved.id);
      if (current) {
        setSaved(current);
        setTarget(current.target);
      }
      client.setQueryData(["/api/ui/imports"], data);
      await client.invalidateQueries({ queryKey: ["/api/ui"] });
      if (request.action === "approve" && request.next)
        setAdvance(request.next);
    },
  });
  useEffect(() => {
    if (advance && !save.isPending && !form.isDirty()) {
      setAdvance(undefined);
      setParams({
        view: "imports",
        item: advance,
        ...(collection ? { collection } : {}),
      });
    }
  }, [
    advance,
    save.isPending,
    target,
    saved.target,
    next,
    collection,
    setParams,
  ]);
  useEffect(() => {
    onDirty(form.isDirty());
    return () => onDirty(false);
  }, [target, saved.target, onDirty]);
  useEffect(() => {
    if (
      !save.isPending &&
      !form.isDirty() &&
      initial.revision !== saved.revision
    ) {
      setSaved(initial);
      setTarget(initial.target);
    }
  }, [initial, saved, target, save.isPending]);
  const reload = useMutation({
    mutationFn: () =>
      client.fetchQuery({
        queryKey: ["/api/ui/imports"],
        queryFn: () => reviewApi.imports(),
        staleTime: 0,
      }),
    onSuccess: (data) => {
      const current = data.tasks.find((task) => task.id === saved.id);
      if (current) {
        setSaved(current);
        setTarget(current.target);
        save.reset();
      }
    },
  });
  const reloadCurrent = () => {
    if (form.isDirty()) {
      modals.openConfirmModal({
        title: "저장하지 않은 변경",
        children: (
          <Text>변경 내용을 버리고 서버의 최신 번역을 불러올까요?</Text>
        ),
        labels: { confirm: "변경 버리고 새로고침", cancel: "계속 편집" },
        onConfirm: () => reload.mutate(),
      });
    } else reload.mutate();
  };
  const saveAction = (
    action: Parameters<typeof reviewApi.saveImport>[1]["action"],
  ) => {
    const request = { action, next };
    if (["defer", "exclude", "restore"].includes(action) && form.isDirty()) {
      modals.openConfirmModal({
        title: "저장하지 않은 변경",
        children: (
          <Text>
            이 작업은 번역을 저장하지 않습니다. 변경 내용을 버리고 계속할까요?
          </Text>
        ),
        labels: { confirm: "변경 버리고 계속", cancel: "계속 편집" },
        onConfirm: () => save.mutate(request),
      });
      return;
    }
    save.mutate(request);
  };
  const editable = saved.locations.some((l) => l.verified);
  return (
    <Stack>
      <UnsavedGuard
        dirty={form.isDirty()}
        pending={save.isPending || reload.isPending}
      />
      <Group justify="space-between">
        <Title order={2}>수집 문구 검수</Title>
        <ReviewBadge status={saved.status} />
      </Group>
      <Textarea label="일본어 원문" value={saved.source} readOnly autosize />
      <Textarea
        label="한국어 번역"
        value={target}
        disabled={!editable || save.isPending || reload.isPending}
        onChange={(e) => form.setFieldValue("target", e.currentTarget.value)}
        autosize
        minRows={3}
      />
      {!editable && (
        <Alert color="orange">
          적용 위치를 확인할 수 없습니다. 문맥을 확인하고 보류하거나 제외하세요.
        </Alert>
      )}
      <Group>
        <Button
          disabled={!editable || reload.isPending}
          loading={save.isPending}
          onClick={() => saveAction("save-draft")}
        >
          초안 저장
        </Button>
        <Button
          color="teal"
          disabled={!editable || save.isPending || reload.isPending}
          onClick={() => saveAction("approve")}
        >
          승인하고 다음
        </Button>
        <Button
          variant="default"
          disabled={save.isPending || reload.isPending}
          onClick={() => saveAction("defer")}
        >
          보류
        </Button>
        <Button
          variant="default"
          disabled={save.isPending || reload.isPending}
          onClick={() => saveAction("exclude")}
        >
          제외
        </Button>
        {["deferred", "excluded"].includes(saved.status) && (
          <Button
            variant="light"
            disabled={save.isPending || reload.isPending}
            onClick={() => saveAction("restore")}
          >
            복원
          </Button>
        )}
      </Group>
      <Button
        variant="subtle"
        disabled={save.isPending || reload.isPending}
        loading={reload.isPending}
        onClick={reloadCurrent}
      >
        최신 번역 다시 불러오기
      </Button>
      <Failure error={save.error ?? reload.error} />
      <Select
        label="관찰 위치"
        value={context}
        onChange={setContext}
        data={saved.locations.map((l, i) => ({
          value: String(i),
          label: `${i + 1}. ${l.title || l.url}`,
        }))}
      />
      {location && (
        <>
          <Text size="sm">{location.url}</Text>
          <Code block>
            {JSON.stringify(
              {
                selector: location.selector,
                attribute: location.attribute,
                reason: location.reason,
                events: location.precedingEvents,
              },
              null,
              2,
            )}
          </Code>
        </>
      )}
      <Failure error={snapshot.error} retry={() => void snapshot.refetch()} />
      {snapshot.isPending ? (
        <Pending />
      ) : (
        snapshot.data && (
          <>
            <Text size="sm">
              {snapshot.data.located
                ? "관찰 위치가 표시됩니다."
                : "원래 관찰 위치를 찾지 못했습니다."}
            </Text>
            <SimpleGrid cols={{ base: 1, xl: 2 }}>
              <Preview inert html={snapshot.data.html} title="수집 원문" />
              <Preview inert html={preview} title="번역 적용" />
            </SimpleGrid>
          </>
        )
      )}
    </Stack>
  );
}

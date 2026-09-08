import {
  Alert,
  Anchor,
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
import { notifications } from "@mantine/notifications";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import type { TranslationEntry } from "translation-core/fixed-translations";
import {
  commonReviewMembers,
  type ReviewDictionary,
} from "translation-core/ui-review-groups";
import { captureBindings, updateBindings } from "../live-preview.ts";
import { reviewApi } from "./client.ts";
import { GlossaryData } from "./glossary-list.tsx";
import { Preview } from "./preview.tsx";
import {
  Failure,
  Pending,
  ReviewBadge,
  UnsavedGuard,
  useApi,
} from "./shared.tsx";
import { QuickTasks } from "./tasks.tsx";

export function GlossaryEditor({
  initial,
  dictionary,
  index,
  data,
}: {
  initial: TranslationEntry;
  dictionary: ReviewDictionary;
  index: number;
  data: GlossaryData;
}) {
  const [saved, setSaved] = useState(initial);
  const form = useForm({ initialValues: { target: initial.target } });
  const target = form.values.target;
  const setTarget = (target: string) => {
    form.setValues({ target });
    form.resetDirty({ target });
  };
  const [revision, setRevision] = useState(dictionary.revision);
  const [chosenPage, setPage] = useState<string | null>();
  const client = useQueryClient();
  const [baseline, setBaseline] = useState(data.dictionaries);
  const members = commonReviewMembers(baseline, dictionary.file, index);
  const matchedPage = data.coverage
    ?.filter(
      (row) =>
        row.file === dictionary.file &&
        row.index === index &&
        (row.source === undefined || row.source === saved.source),
    )
    .flatMap((row) => row.pages)
    .find((name) => data.pages.includes(name));
  const automaticPage =
    matchedPage ??
    data.pages.find(
      (name) => name === dictionary.file.replace(/\.json$/, ".html"),
    ) ??
    data.pages.find((name) => name === "main.html") ??
    data.pages[0] ??
    null;
  const page =
    chosenPage === null
      ? null
      : chosenPage !== undefined && data.pages.includes(chosenPage)
        ? chosenPage
        : automaticPage;

  const source = useApi(
    `/api/ui-pages/${encodeURIComponent(page ?? "")}`,
    (signal) => reviewApi.page(page ?? "", signal),
    !!page,
  );
  const preview = useMemo(() => {
    if (!source.data) return { html: "" };
    try {
      const doc = new DOMParser().parseFromString(
        source.data.html,
        "text/html",
      );
      const entries = members.length
        ? members.map((m) => ({ ...m.entry, target }))
        : [{ ...saved, target }];
      updateBindings(doc, captureBindings(doc, entries), target);
      for (const entry of entries)
        for (const element of doc.querySelectorAll(entry.selector))
          (element as HTMLElement).style.outline = "2px solid #228be6";
      return { html: doc.documentElement.outerHTML };
    } catch (error) {
      return { html: "", error };
    }
  }, [source.data, members, target, saved]);
  const save = useMutation({
    mutationFn: async (action: "save" | "approve" | "unapprove") => {
      if (members.length > 1) {
        return reviewApi.saveShared(dictionary.file, index, {
          target,
          action,
          members: members.map((m) => ({
            file: m.dictionary.file,
            index: m.index,
            revision: m.dictionary.revision,
          })),
        });
      }
      const result = await reviewApi.saveMessage(dictionary.file, index, {
        target,
        action,
        revision,
      });
      return {
        dictionaries: ("dictionaries" in result
          ? result.dictionaries
          : undefined) ?? [
          {
            ...dictionary,
            revision: result.revision,
            entries: dictionary.entries.map((e, i) =>
              i === index ? result.entry : e,
            ),
          },
        ],
      };
    },
    onSuccess: async (result) => {
      notifications.show({ message: "문구를 저장했습니다.", color: "teal" });
      const current = result.dictionaries.find(
        (d) => d.file === dictionary.file,
      )!;
      setSaved(current.entries[index]);
      setTarget(current.entries[index].target);
      setRevision(current.revision);
      setBaseline(
        data.dictionaries.map(
          (d) => result.dictionaries.find((n) => n.file === d.file) ?? d,
        ),
      );
      client.setQueryData<GlossaryData>(["/api/ui"], (old) =>
        old
          ? {
              ...old,
              dictionaries: old.dictionaries.map(
                (d) => result.dictionaries.find((n) => n.file === d.file) ?? d,
              ),
            }
          : old,
      );
      await client.invalidateQueries({ queryKey: ["/api/ui/imports"] });
    },
  });
  const reload = useMutation({
    mutationFn: async () => {
      const fresh = await reviewApi.glossary();
      const current = fresh.dictionaries.find(
        (d) => d.file === dictionary.file,
      );
      if (!current?.entries[index])
        throw new Error("이 문구가 삭제되었습니다. 다른 항목을 선택하세요.");
      return { fresh, current };
    },
    onSuccess: ({ fresh, current }) => {
      setSaved(current.entries[index]);
      setTarget(current.entries[index].target);
      setRevision(current.revision);
      setBaseline(fresh.dictionaries);
      client.setQueryData(["/api/ui"], fresh);
      save.reset();
    },
  });
  const observed = useRef(dictionary.revision);
  useEffect(() => {
    if (
      dictionary.revision === observed.current ||
      form.isDirty() ||
      save.isPending ||
      reload.isPending
    )
      return;
    observed.current = dictionary.revision;
    setSaved(initial);
    setTarget(initial.target);
    setRevision(dictionary.revision);
    setBaseline(data.dictionaries);
  }, [
    dictionary.revision,
    initial,
    data.dictionaries,
    target,
    saved.target,
    save.isPending,
    reload.isPending,
  ]);
  const reloadCurrent = () => {
    if (form.isDirty()) {
      modals.openConfirmModal({
        title: "수정 내용을 버리고 다시 불러오기",
        children: (
          <Text>
            저장하지 않은 번역을 버리고 디스크의 최신 문구를 불러올까요?
          </Text>
        ),
        labels: { confirm: "버리고 다시 불러오기", cancel: "계속 편집" },
        onConfirm: () => reload.mutate(),
      });
    } else reload.mutate();
  };
  return (
    <Stack>
      <UnsavedGuard
        dirty={form.isDirty()}
        pending={save.isPending || reload.isPending}
      />
      <Group justify="space-between">
        <Title order={2}>문구 검수</Title>
        <ReviewBadge status={saved.reviewStatus ?? "unreviewed"} />
      </Group>
      <Text size="sm" c="dimmed">
        {saved.variant === undefined
          ? "기본 표현"
          : `문맥별 표현 ${saved.variant + 1}`}
      </Text>
      <Button
        variant="subtle"
        loading={reload.isPending}
        disabled={save.isPending}
        onClick={reloadCurrent}
      >
        문구 다시 불러오기
      </Button>
      <Textarea label="일본어 원문" value={saved.source} readOnly autosize />
      <Textarea
        label="한국어 번역"
        value={target}
        onChange={(e) => form.setFieldValue("target", e.currentTarget.value)}
        disabled={save.isPending || reload.isPending}
        autosize
        minRows={3}
      />
      {form.isDirty() && (
        <Alert color="orange">
          저장하지 않은 변경이 있습니다.
          <Text size="sm">수정 전: {saved.target}</Text>
        </Alert>
      )}
      {dictionary.revision !== revision && (
        <Alert color="orange">
          디스크의 사전이 변경되었습니다. 수정 내용을 보관한 뒤 최신 문구를 다시
          불러오세요.
        </Alert>
      )}
      {members.length > 1 && (
        <Alert color="blue">
          같은 의미의 {members.length}개 적용 위치에 함께 저장합니다.
        </Alert>
      )}
      <Group>
        <Button loading={save.isPending} onClick={() => save.mutate("save")}>
          초안 저장
        </Button>
        <Button
          color="teal"
          disabled={save.isPending || reload.isPending}
          onClick={() => save.mutate("approve")}
        >
          검수 승인
        </Button>
        <Button
          variant="default"
          disabled={save.isPending || reload.isPending}
          onClick={() => save.mutate("unapprove")}
        >
          승인 취소
        </Button>
      </Group>
      <Failure error={save.error ?? reload.error} />
      <Text size="sm">이름 있는 변수와 적용 위치를 확인한 뒤 승인하세요.</Text>
      <Code block>
        {JSON.stringify(
          {
            selector: saved.selector,
            attribute: saved.attribute,
            variables: saved.variables,
            messageId: saved.messageId,
          },
          null,
          2,
        )}
      </Code>
      {data.sourceContexts
        ?.filter((c) => c.file === dictionary.file && c.source === saved.source)
        .map((c, i) => (
          <Text key={i} size="sm">
            <Anchor
              href={c.evidenceUrl ?? c.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              원문 문맥
            </Anchor>{" "}
            · {c.state} · {c.kind}
          </Text>
        ))}
      <QuickTasks kind="ui" />
      <Select
        label="미리보기 페이지"
        data={data.pages}
        value={page}
        onChange={setPage}
        searchable
        clearable
      />
      {page && (
        <Button variant="subtle" onClick={() => void source.refetch()}>
          미리보기 새로고침
        </Button>
      )}
      {!data.pages.length && (
        <Text c="dimmed">
          도구에서 UI 미리보기를 다운로드하면 문맥을 확인할 수 있습니다.
        </Text>
      )}
      <Failure
        error={source.error ?? preview.error}
        retry={() => void source.refetch()}
      />
      {page && source.isPending ? (
        <Pending />
      ) : (
        source.data && (
          <SimpleGrid cols={{ base: 1, xl: 2 }}>
            <Preview html={source.data.html} title="일본어 페이지" />
            <Preview html={preview.html} title="번역 적용 페이지" />
          </SimpleGrid>
        )
      )}
    </Stack>
  );
}

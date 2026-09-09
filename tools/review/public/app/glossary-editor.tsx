import {
  Accordion,
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
import { ExtensionPreview } from "./extension-preview.tsx";
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
  onApproved,
}: {
  initial: TranslationEntry;
  dictionary: ReviewDictionary;
  index: number;
  data: GlossaryData;
  onApproved: () => void;
}) {
  const [saved, setSaved] = useState(initial);
  const [advance, setAdvance] = useState<(() => void) | null>(null);
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
        ((row.file === dictionary.file && row.index === index) ||
          members.some(
            (member) =>
              member.dictionary.file === row.file && member.index === row.index,
          )) &&
        (row.source === undefined || row.source === saved.source),
    )
    .flatMap((row) => row.pages)
    .find((name) => data.pages.includes(name));
  const extension = dictionary.file === "extension.json";
  const [candidateIndex, setCandidateIndex] = useState(0);
  const stem = dictionary.file.replace(/\.json$/, "");
  const candidates = [
    ...new Set([
      ...(matchedPage ? [matchedPage] : []),
      ...data.pages.filter(
        (name) => name === `${stem}.html` || name.startsWith(`${stem}_`),
      ),
    ]),
  ];
  const automaticPage = candidates[candidateIndex] ?? null;
  const page =
    extension || chosenPage === null
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
      const bindings = captureBindings(doc, entries);
      if (!bindings.length) return { html: "" };
      const pageFiles = new Set([
        "common.json",
        "shared.json",
        dictionary.file,
        ...(data.coverage ?? [])
          .filter((row) => page && row.pages.includes(page))
          .map((row) => row.file),
      ]);
      const surrounding = captureBindings(
        doc,
        data.dictionaries
          .filter((item) => pageFiles.has(item.file))
          .flatMap((item) => item.entries),
      );
      for (const binding of surrounding)
        updateBindings(doc, [binding], binding.entry.target);
      // Selected bindings retain their original text, so the unsaved draft wins.
      updateBindings(doc, bindings, target);
      for (const binding of bindings) {
        let node: Node = doc.documentElement;
        for (const index of binding.path) node = node.childNodes[index];
        const element =
          node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
        if (element) {
          element.style.outline = "2px solid #228be6";
          element.setAttribute("data-review-selected", "");
        }
      }
      return { html: doc.documentElement.outerHTML };
    } catch (error) {
      return { html: "", error };
    }
  }, [
    source.data,
    members,
    target,
    saved,
    data.dictionaries,
    data.coverage,
    dictionary.file,
    page,
  ]);
  useEffect(() => {
    if (
      !extension &&
      chosenPage === undefined &&
      source.data &&
      !preview.html &&
      !preview.error &&
      candidateIndex + 1 < candidates.length
    )
      setCandidateIndex((value) => value + 1);
  }, [
    extension,
    chosenPage,
    source.data,
    preview.html,
    preview.error,
    candidateIndex,
    candidates.length,
  ]);
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
    onSuccess: async (result, action) => {
      if (action === "approve") setAdvance(() => onApproved);
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
  useEffect(() => {
    if (advance && !save.isPending && !form.isDirty()) {
      setAdvance(null);
      advance();
    }
  }, [advance, save.isPending, target]);
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
  const focusPreview = (frame: HTMLIFrameElement) => {
    if (preview.error) return;
    const doc = frame.contentDocument;
    const element =
      doc?.querySelector("[data-review-selected]") ??
      doc?.querySelector(saved.selector);
    const scrolling = doc?.scrollingElement ?? doc?.documentElement;
    if (element && scrolling)
      scrolling.scrollTop = Math.max(
        0,
        scrolling.scrollTop +
          element.getBoundingClientRect().top -
          frame.clientHeight / 2,
      );
  };
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
    <Stack style={{ minWidth: 0, overflowWrap: "anywhere" }}>
      <UnsavedGuard
        dirty={form.isDirty()}
        pending={save.isPending || reload.isPending}
      />
      <Group justify="space-between">
        <Title order={2}>문구 검수</Title>
        <Group gap="xs">
          <ReviewBadge status={saved.reviewStatus ?? "unreviewed"} />
        </Group>
      </Group>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Textarea label="일본어 원문" value={saved.source} readOnly autosize />
        <Textarea
          label="한국어 번역"
          value={target}
          onChange={(e) => form.setFieldValue("target", e.currentTarget.value)}
          disabled={save.isPending || reload.isPending}
          autosize
          minRows={1}
        />
      </SimpleGrid>
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
      <Failure
        error={source.error ?? preview.error}
        retry={() => void source.refetch()}
      />
      {extension ? (
        <ExtensionPreview entry={saved} text={target} />
      ) : page && source.isPending ? (
        <Pending />
      ) : preview.html ? (
        <Preview
          key={page}
          html={preview.html}
          title="번역 적용 페이지"
          showHeading={false}
          onFrame={focusPreview}
        />
      ) : (
        !source.error && (
          <Text c="dimmed">
            선택한 문구와 일치하는 미리보기를 찾지 못했습니다. 미리보기 설정에서
            저장된 페이지나 수집 ZIP 화면을 선택해 주세요.
          </Text>
        )
      )}
      <Accordion>
        <Accordion.Item value="preview">
          <Accordion.Control>미리보기 설정 및 원문 비교</Accordion.Control>
          <Accordion.Panel>
            <Stack>
              {!extension && (
                <>
                  <Group align="end">
                    <Select
                      style={{ flex: 1 }}
                      label="미리보기 페이지"
                      data={data.pages.map((value) => ({
                        value,
                        label: data.pageLabels?.[value] ?? value,
                      }))}
                      value={page}
                      onChange={setPage}
                      searchable
                      clearable
                    />
                    {page && (
                      <Button
                        variant="subtle"
                        onClick={() => void source.refetch()}
                      >
                        미리보기 새로고침
                      </Button>
                    )}
                  </Group>
                </>
              )}
              {extension ? (
                <ExtensionPreview entry={saved} text={saved.source} />
              ) : preview.html && source.data ? (
                <Preview
                  key={page}
                  html={source.data.html}
                  title="일본어 페이지"
                  onFrame={focusPreview}
                />
              ) : null}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="details">
          <Accordion.Control>상세 정보</Accordion.Control>
          <Accordion.Panel>
            <Stack>
              <Text size="sm" c="dimmed">
                {saved.variant === undefined
                  ? "기본 표현"
                  : `문맥별 표현 ${saved.variant + 1}`}
              </Text>

              <Text size="sm">
                이름 있는 변수와 적용 위치를 확인한 뒤 승인하세요.
              </Text>
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
                ?.filter(
                  (c) =>
                    c.file === dictionary.file && c.source === saved.source,
                )
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
              <Button
                variant="subtle"
                size="compact-xs"
                loading={reload.isPending}
                disabled={save.isPending}
                onClick={reloadCurrent}
              >
                문구 다시 불러오기
              </Button>
              <QuickTasks kind="ui" />
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}

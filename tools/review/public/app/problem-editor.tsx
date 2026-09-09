import { useNavigate } from "react-router-dom";
import { problemReviews } from "translation-core/problem-review-status";
import { html } from "@codemirror/lang-html";
import { markdown } from "@codemirror/lang-markdown";
import {
  Accordion,
  Badge,
  Box,
  Button,
  Checkbox,
  Group,
  Menu,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useDebouncedValue, useLocalStorage } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "codemirror";
import * as htmlPlugin from "prettier/plugins/html";
import * as markdownPlugin from "prettier/plugins/markdown";
import { format } from "prettier/standalone";
import { useEffect, useMemo, useRef, useState } from "react";
import { compileProblemMarkdown } from "translation-core/problem-markdown";
import type { ProblemReview } from "../../src/problem-review.ts";
import { reviewApi } from "./client.ts";
import { applySavedSource } from "./editor-source.ts";
import { Preview } from "./preview.tsx";
import { Failure, ReviewBadge, UnsavedGuard, useApi } from "./shared.tsx";
import { QuickTasks } from "./tasks.tsx";

export function ProblemEditor({ initial }: { initial: ProblemReview }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const problems = useApi("/api/problems", (signal) =>
    reviewApi.problems(signal),
  );
  const [autoNext, setAutoNext] = useLocalStorage({
    key: "problem-review-auto-next",
    defaultValue: false,
  });
  const [advance, setAdvance] = useState(false);
  const [saved, setSaved] = useState(initial);
  const [source, setSource] = useState(initial.koreanSource);
  const currentSource = useRef(source);
  currentSource.current = source;
  const editor = useRef<EditorView | null>(null);
  const [compiled, setCompiled] = useState(false);
  const [japaneseDocument, setJapaneseDocument] = useState<Document | null>(
    null,
  );
  const [koreanDocument, setKoreanDocument] = useState<Document | null>(null);
  const [debounced] = useDebouncedValue(source, 180);
  const extensions = useMemo(
    () => [
      saved.sourceFormat === "mdx" && !compiled ? markdown() : html(),
      EditorView.lineWrapping,
    ],
    [saved.sourceFormat, compiled],
  );
  const preview = useMemo(() => {
    try {
      return {
        html:
          saved.sourceFormat === "mdx"
            ? compileProblemMarkdown(debounced)
            : debounced,
      };
    } catch (error) {
      return { html: undefined, error };
    }
  }, [debounced, saved.sourceFormat]);
  const lastValidHtml = useRef(initial.koreanHtml);
  useEffect(() => {
    if (preview.html !== undefined) lastValidHtml.current = preview.html;
  }, [preview.html]);
  const previewHtml = preview.html ?? lastValidHtml.current;
  const dirty = source !== saved.koreanSource;
  const reviews =
    saved.reviews ??
    problemReviews(saved.machineTranslated ? "machine" : saved.reviewStatus);
  const candidates = (problems.data?.problems ?? [])
    .filter(
      (p) =>
        p.problemNo !== saved.problemNo &&
        (p.reviews
          ? p.reviews.human !== "approved"
          : p.reviewStatus !== "approved"),
    )
    .sort((a, b) => a.problemNo - b.problemNo);
  const next =
    candidates.find((p) => p.problemNo > saved.problemNo) ?? candidates[0];
  const formatting = useMutation({
    mutationFn: () =>
      format(source, {
        parser: saved.sourceFormat === "mdx" ? "mdx" : "html",
        plugins: [markdownPlugin, htmlPlugin],
      }),
    onSuccess: setSource,
  });
  const save = useMutation({
    mutationFn: async (action: "save" | "approve" | "unapprove") => {
      const submittedSource =
        !compiled && editor.current
          ? editor.current.state.doc.toString()
          : currentSource.current;
      const data = await reviewApi.saveProblem(
        String(saved.problemNo),
        { html: submittedSource, revision: saved.revision },
        action,
      );
      return { data, submittedSource };
    },
    onSuccess: async ({ data, submittedSource }, action) => {
      notifications.show({
        message: "저장했습니다. 검수 상태를 확인하세요.",
        color: "teal",
      });
      setSaved(data);
      // Keep anything typed while the request was in flight as an unsaved draft.
      const latestSource =
        !compiled && editor.current
          ? editor.current.state.doc.toString()
          : currentSource.current;
      if (latestSource === submittedSource) {
        if (editor.current && !compiled)
          applySavedSource(editor.current, data.koreanSource);
        setSource(data.koreanSource);
      }
      client.setQueryData([`/api/problems/${data.problemNo}`], data);
      await client.invalidateQueries({ queryKey: ["/api/problems"] });
      if (
        action === "approve" &&
        autoNext &&
        currentSource.current === data.koreanSource
      )
        setAdvance(true);
    },
  });
  useEffect(() => {
    const handleSave = (event: KeyboardEvent) => {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "s" ||
        event.altKey ||
        event.shiftKey
      )
        return;
      event.preventDefault();
      if (
        event.repeat ||
        event.isComposing ||
        save.isPending ||
        formatting.isPending
      )
        return;
      save.mutate("save");
    };
    const documents = [document, japaneseDocument, koreanDocument];
    documents.forEach((doc) =>
      doc?.addEventListener("keydown", handleSave, true),
    );
    return () => {
      documents.forEach((doc) =>
        doc?.removeEventListener("keydown", handleSave, true),
      );
    };
  }, [
    save.mutate,
    save.isPending,
    formatting.isPending,
    japaneseDocument,
    koreanDocument,
  ]);
  useEffect(() => {
    if (!advance || dirty || save.isPending) return;
    setAdvance(false);
    if (next) navigate(`/?problem=${next.problemNo}`);
    else
      notifications.show({
        message: "다음 미검수 문제가 없습니다.",
        color: "teal",
      });
  }, [advance, dirty, save.isPending, next?.problemNo, navigate]);
  const observed = useRef(initial);
  useEffect(() => {
    if (initial === observed.current || save.isPending || formatting.isPending)
      return;
    if (initial.revision === saved.revision || !dirty) {
      observed.current = initial;
      setSaved(initial);
      if (!dirty) setSource(initial.koreanSource);
    }
  }, [initial, saved.revision, dirty, save.isPending, formatting.isPending]);
  return (
    <Stack gap="xs" style={{ minWidth: 0 }}>
      <UnsavedGuard
        dirty={dirty}
        pending={save.isPending || formatting.isPending}
      />
      <Group justify="space-between">
        <Title order={2}>
          {saved.problemNo}. {saved.koreanTitle}
        </Title>
        <Group gap="xs">
          <ReviewBadge
            status={
              saved.validationErrors?.length
                ? "invalid"
                : reviews.human === null && reviews.machine === "approved"
                  ? "기계 승인"
                  : saved.reviewStatus === "approved"
                    ? "approved"
                    : saved.machineTranslated
                      ? "machine"
                      : "unreviewed"
            }
          />
          <Badge color={reviews.human === "approved" ? "teal" : "gray"}>
            사람 검수:{" "}
            {reviews.human === "approved"
              ? "승인"
              : reviews.human === null
                ? "미검수"
                : "미승인"}
          </Badge>
          <Badge color={reviews.machine === "approved" ? "blue" : "gray"}>
            기계 검수: {reviews.machine === "approved" ? "승인" : "미검수"}
          </Badge>
        </Group>
      </Group>
      <Box style={{ overflowX: "auto" }}>
        <Group gap="xs" wrap="nowrap" style={{ minWidth: "max-content" }}>
          <Button
            loading={save.isPending}
            disabled={formatting.isPending}
            onClick={() => save.mutate("save")}
          >
            저장
          </Button>
          <Button
            color="teal"
            disabled={save.isPending || formatting.isPending}
            onClick={() => save.mutate("approve")}
          >
            검수 승인
          </Button>
          <Button
            variant="default"
            disabled={!next || dirty || save.isPending || formatting.isPending}
            onClick={() => next && navigate(`/?problem=${next.problemNo}`)}
          >
            다음 미검수 문제로
          </Button>
          <Menu position="bottom-start" withinPortal>
            <Menu.Target>
              <Button
                variant="default"
                disabled={save.isPending || formatting.isPending}
              >
                검수 옵션
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                disabled={dirty || saved.reviewStatus !== "approved"}
                onClick={() => save.mutate("unapprove")}
              >
                승인 취소
              </Menu.Item>
              <Menu.Item
                disabled={
                  dirty ||
                  reviews.machine !== "approved" ||
                  reviews.human === "unreviewed"
                }
                onClick={() => save.mutate("unapprove")}
              >
                기계 승인 무효화
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
          <Checkbox
            size="xs"
            label="검수 승인 후 자동으로 다음으로 넘어가기"
            checked={autoNext}
            onChange={(e) => setAutoNext(e.currentTarget.checked)}
            styles={{ label: { whiteSpace: "nowrap" } }}
          />
          {dirty && <Badge color="orange">저장하지 않음</Badge>}
        </Group>
      </Box>
      <Failure error={save.error ?? formatting.error} />
      {saved.validationErrors?.map((error) => (
        <Failure key={error} error={error} />
      ))}
      {saved.validationWarnings.map((w) => (
        <Text key={w} c="orange.8" size="sm">
          {w}
        </Text>
      ))}
      <Failure error={preview.error} />
      <SimpleGrid cols={{ base: 1, lg: 3 }} style={{ alignItems: "start" }}>
        <Preview
          html={saved.japaneseHtml}
          title="일본어 원문"
          contentHeading={`No.${saved.problemNo} ${saved.japaneseTitle}`}
          onFrame={(frame) => setJapaneseDocument(frame.contentDocument)}
        />
        <Preview
          html={previewHtml}
          title="한국어 번역"
          onFrame={(frame) => setKoreanDocument(frame.contentDocument)}
        />
        <Stack gap="xs" style={{ minWidth: 0 }}>
          <Text fw={600}>번역 소스</Text>
          <CodeMirror
            value={compiled ? previewHtml : source}
            editable={!compiled && !formatting.isPending}
            onCreateEditor={(view) => {
              editor.current = view;
            }}
            height="72vh"
            extensions={extensions}
            onChange={setSource}
            aria-label="번역 소스"
          />
        </Stack>
      </SimpleGrid>
      <Accordion>
        <Accordion.Item value="tools">
          <Accordion.Control>편집 도구 및 검사</Accordion.Control>
          <Accordion.Panel>
            <Stack>
              <Group justify="space-between">
                <Text size="sm">{saved.sourceFormat.toUpperCase()}</Text>
                <Button
                  variant="subtle"
                  loading={formatting.isPending}
                  disabled={compiled || save.isPending}
                  onClick={() => formatting.mutate()}
                >
                  서식 정리
                </Button>
                {saved.sourceFormat === "mdx" && (
                  <Button
                    variant="subtle"
                    onClick={() => setCompiled(!compiled)}
                  >
                    {compiled ? "소스 편집" : "컴파일된 HTML 보기"}
                  </Button>
                )}
              </Group>
              <QuickTasks kind="problem" number={saved.problemNo} />
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}

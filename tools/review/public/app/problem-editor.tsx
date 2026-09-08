import { html } from "@codemirror/lang-html";
import { markdown } from "@codemirror/lang-markdown";
import {
  Badge,
  Button,
  Group,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
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
import { Comparison, Preview } from "./preview.tsx";
import { Failure, ReviewBadge, UnsavedGuard } from "./shared.tsx";
import { QuickTasks } from "./tasks.tsx";

export function ProblemEditor({ initial }: { initial: ProblemReview }) {
  const client = useQueryClient();
  const [saved, setSaved] = useState(initial);
  const [source, setSource] = useState(initial.koreanSource);
  const [compiled, setCompiled] = useState(false);
  const [debounced] = useDebouncedValue(source, 180);
  const preview = useMemo(() => {
    try {
      return {
        html:
          saved.sourceFormat === "mdx"
            ? compileProblemMarkdown(debounced)
            : debounced,
      };
    } catch (error) {
      return { html: "", error };
    }
  }, [debounced, saved.sourceFormat]);
  const dirty = source !== saved.koreanSource;
  const formatting = useMutation({
    mutationFn: () =>
      format(source, {
        parser: saved.sourceFormat === "mdx" ? "mdx" : "html",
        plugins: [markdownPlugin, htmlPlugin],
      }),
    onSuccess: setSource,
  });
  const save = useMutation({
    mutationFn: (action: "save" | "approve" | "unapprove") =>
      reviewApi.saveProblem(
        String(saved.problemNo),
        { html: source, revision: saved.revision },
        action,
      ),
    onSuccess: async (data) => {
      notifications.show({
        message: "저장했습니다. 검수 상태를 확인하세요.",
        color: "teal",
      });
      setSaved(data);
      setSource(data.koreanSource);
      client.setQueryData([`/api/problems/${data.problemNo}`], data);
      await client.invalidateQueries({ queryKey: ["/api/problems"] });
    },
  });
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
    <Stack>
      <UnsavedGuard
        dirty={dirty}
        pending={save.isPending || formatting.isPending}
      />
      <Group justify="space-between">
        <Title order={2}>
          {saved.problemNo}. {saved.koreanTitle}
        </Title>
        <ReviewBadge
          status={
            saved.validationErrors?.length
              ? "invalid"
              : saved.reviewStatus === "approved"
                ? "approved"
                : saved.machineTranslated
                  ? "machine"
                  : "unreviewed"
          }
        />
      </Group>
      <Text c="dimmed">{saved.japaneseTitle}</Text>
      <Group>
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
          disabled={save.isPending || saved.reviewStatus !== "approved"}
          onClick={() => save.mutate("unapprove")}
        >
          승인 취소
        </Button>
        {dirty && <Badge color="orange">저장하지 않음</Badge>}
      </Group>
      <Failure error={save.error ?? formatting.error} />
      {saved.validationErrors?.map((error) => (
        <Failure key={error} error={error} />
      ))}
      {saved.validationWarnings.map((w) => (
        <Text key={w} c="orange.8" size="sm">
          {w}
        </Text>
      ))}
      <QuickTasks kind="problem" number={saved.problemNo} />
      <Tabs defaultValue="editor">
        <Tabs.List>
          <Tabs.Tab value="editor">번역 편집</Tabs.Tab>
          <Tabs.Tab value="preview">원문 · 번역 비교</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="editor" pt="md">
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
                <Button variant="subtle" onClick={() => setCompiled(!compiled)}>
                  {compiled ? "소스 편집" : "컴파일된 HTML 보기"}
                </Button>
              )}
            </Group>
            <Failure error={preview.error} />
            <SimpleGrid cols={{ base: 1, xl: 2 }}>
              <CodeMirror
                value={compiled ? preview.html : source}
                editable={!compiled && !save.isPending && !formatting.isPending}
                height="60vh"
                extensions={[
                  saved.sourceFormat === "mdx" && !compiled
                    ? markdown()
                    : html(),
                  EditorView.lineWrapping,
                ]}
                onChange={setSource}
                aria-label="번역 소스"
              />
              <Preview html={preview.html} title="번역 미리보기" />
            </SimpleGrid>
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="preview" pt="md">
          <Comparison japanese={saved.japaneseHtml} korean={preview.html} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

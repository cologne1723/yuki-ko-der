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
  Switch,
  Text,
  TextInput,
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
  const [reviewerId, setReviewerId] = useLocalStorage({
    key: "problem-reviewer-id",
    defaultValue: "",
  });
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
          ? p.reviews.human.length === 0
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
  const collectProfile = useMutation({
    mutationFn: () => reviewApi.collectProblemProfile(String(saved.problemNo)),
    onSuccess: async (data) => {
      // Collection may outlast an external source edit. Its verified profile can
      // update independently without replacing the draft or saved source revision.
      setSaved((current) => ({
        ...current,
        renderProfile: data.renderProfile,
        renderProfileError: data.renderProfileError,
        sourceUrl: data.sourceUrl,
      }));
      await client.invalidateQueries({
        queryKey: [`/api/problems/${saved.problemNo}`],
      });
    },
  });
  const save = useMutation({
    mutationFn: async (
      action:
        "save" | "approve" | "unapprove" | "visibility" | "invalidate-machine",
    ) => {
      const submittedSource =
        !compiled && editor.current
          ? editor.current.state.doc.toString()
          : currentSource.current;
      const data =
        action === "visibility"
          ? await reviewApi.setProblemVisibility(
              String(saved.problemNo),
              saved.visibility === false,
              saved.revision,
            )
          : action === "invalidate-machine"
            ? await reviewApi.invalidateProblemMachineReview(
                String(saved.problemNo),
                submittedSource,
                saved.revision,
              )
            : await reviewApi.saveProblem(
                String(saved.problemNo),
                {
                  html: submittedSource,
                  revision: saved.revision,
                  reviewerId: reviewerId.trim(),
                },
                action,
              );
      return { data, submittedSource };
    },
    onSuccess: async ({ data, submittedSource }, action) => {
      notifications.show({
        message:
          action === "visibility"
            ? "공개 설정을 저장했습니다. 배포 후 반영됩니다."
            : "저장했습니다. 검수 상태를 확인하세요.",
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
                : !reviews.human.length && reviews.machine === "approved"
                  ? "기계 승인"
                  : saved.reviewStatus === "approved"
                    ? "approved"
                    : saved.machineTranslated
                      ? "machine"
                      : "unreviewed"
            }
          />
          <Badge color={reviews.human.length ? "teal" : "gray"}>
            사람 검수:{" "}
            {reviews.human.length ? reviews.human.join(", ") : "미검수"}
          </Badge>
          <Badge color={reviews.machine === "approved" ? "blue" : "gray"}>
            기계 검수: {reviews.machine === "approved" ? "승인" : "미검수"}
          </Badge>
        </Group>
      </Group>
      <TextInput
        label="검수자 ID"
        description="프로젝트 식별자입니다. GitHub 인증이 아니며, 실제 검수한 ID만 기록하세요."
        value={reviewerId}
        onChange={(event) => setReviewerId(event.currentTarget.value)}
        disabled={save.isPending}
      />
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
            disabled={
              save.isPending || formatting.isPending || !reviewerId.trim()
            }
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
                disabled={dirty || !reviews.human.includes(reviewerId.trim())}
                onClick={() => save.mutate("unapprove")}
              >
                내 검수 승인 취소
              </Menu.Item>
              <Menu.Item
                disabled={dirty || reviews.machine !== "approved"}
                onClick={() => save.mutate("invalidate-machine")}
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
          <Switch
            aria-label="번역 공개"
            label="번역 공개"
            checked={saved.visibility !== false}
            disabled={
              dirty ||
              save.isPending ||
              formatting.isPending ||
              saved.sourceFormat !== "mdx"
            }
            onChange={() => save.mutate("visibility")}
            description={
              dirty
                ? "편집 내용을 먼저 저장하세요."
                : "끄면 다음 배포에서 제외됩니다. 본문과 검수 상태는 유지됩니다."
            }
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
      {!saved.renderProfile && (
        <Stack role="alert" gap="xs">
          <Text c="orange.8">
            저장된 원문의 렌더링 프로필이 없어 원문과 같은 수식 표시를 확인할 수
            없습니다. 이 문제의 원문 페이지에서 프로필을 수집해 다시 시도하세요.
          </Text>
          {saved.renderProfileError && (
            <Text size="sm">{saved.renderProfileError}</Text>
          )}
          <Button
            variant="light"
            loading={collectProfile.isPending}
            onClick={() => collectProfile.mutate()}
          >
            렌더링 프로필 수집 후 다시 시도
          </Button>
          {collectProfile.isPending && (
            <Text role="status">
              프로필 수집 중입니다. 서버 요청 간격과 재시도 대기 시간을
              지킵니다.
            </Text>
          )}
          <Failure error={collectProfile.error} />
        </Stack>
      )}
      <SimpleGrid cols={{ base: 1, lg: 3 }} style={{ alignItems: "start" }}>
        <Preview
          html={saved.japaneseHtml}
          title="일본어 원문"
          contentHeading={`No.${saved.problemNo} ${saved.japaneseTitle}`}
          renderProfile={saved.renderProfile}
          sourceUrl={
            saved.sourceUrl ??
            `https://yukicoder.me/problems/no/${saved.problemNo}`
          }
          onFrame={(frame) => setJapaneseDocument(frame.contentDocument)}
        />
        <Preview
          html={previewHtml}
          title="한국어 번역"
          renderProfile={saved.renderProfile}
          sourceUrl={
            saved.sourceUrl ??
            `https://yukicoder.me/problems/no/${saved.problemNo}`
          }
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

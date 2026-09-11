import {
  Button,
  Checkbox,
  Paper,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import type { ProblemRenderProfile } from "translation-core/problem-render-profile";
import { previewDocument } from "./preview-document.ts";
import { bindPreviewLinks } from "./preview-links.ts";
import { useComparisonScroll } from "./use-comparison-scroll.ts";

export function Preview({
  html,
  title,
  contentHeading,
  inert = false,
  showHeading = true,
  onFrame,
  renderProfile,
  sourceUrl,
}: {
  html: string;
  title: string;
  contentHeading?: string;
  inert?: boolean;
  showHeading?: boolean;
  onFrame?: (frame: HTMLIFrameElement) => void;
  renderProfile?: ProblemRenderProfile;
  sourceUrl?: string;
}) {
  const [source, setSource] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(true);
  const [retry, setRetry] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(() => {
      const next = { width: frame.clientWidth, height: frame.clientHeight };
      setViewport((previous) =>
        previous.width === next.width && previous.height === next.height
          ? previous
          : next,
      );
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    setPending(true);
    setError(undefined);
    void previewDocument(
      html,
      inert,
      undefined,
      contentHeading,
      renderProfile,
      sourceUrl,
      {
        signal: controller.signal,
        width: frameRef.current?.clientWidth,
        height: frameRef.current?.clientHeight,
      },
    )
      .then((next) => {
        if (current) setSource(next);
      })
      .catch((error: unknown) => {
        if (current) setError(String(error));
      })
      .finally(() => {
        if (current) setPending(false);
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [
    html,
    inert,
    contentHeading,
    renderProfile?.engine,
    renderProfile?.version,
    sourceUrl,
    retry,
    viewport.width,
    viewport.height,
  ]);
  const position = useRef<{ top: number; left: number } | undefined>(undefined);
  const detachScroll = useRef<(() => void) | undefined>(undefined);
  useEffect(() => () => detachScroll.current?.(), []);
  const loaded = (frame: HTMLIFrameElement) => {
    detachScroll.current?.();
    detachScroll.current = undefined;
    const previous = position.current;
    if (inert) {
      onFrame?.(frame);
      return;
    }
    const doc = frame.contentDocument;
    const scrolling = doc?.scrollingElement ?? doc?.documentElement;
    if (!doc || !scrolling) {
      onFrame?.(frame);
      return;
    }
    const detachLinks = bindPreviewLinks(doc, sourceUrl);
    if (previous) {
      scrolling.scrollTop = previous.top;
      scrolling.scrollLeft = previous.left;
    }
    onFrame?.(frame);
    const remember = () => {
      position.current = {
        top: scrolling.scrollTop,
        left: scrolling.scrollLeft,
      };
    };
    remember();
    doc.addEventListener("scroll", remember);
    detachScroll.current = () => {
      doc.removeEventListener("scroll", remember);
      detachLinks();
    };
  };
  return (
    <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
      <Stack gap={0} aria-busy={pending}>
        {showHeading && (
          <Text fw={600} p="sm" bg="gray.0">
            {title}
          </Text>
        )}
        {pending && (
          <Text role="status" p="sm">
            미리보기 렌더링 중…
          </Text>
        )}
        {error && (
          <Stack role="alert" p="sm" gap="xs">
            <Text>
              미리보기를 렌더링할 수 없습니다.{" "}
              {source ? "이전 미리보기를 표시합니다. " : ""}
              {error}
            </Text>
            <Button
              variant="light"
              onClick={() => setRetry((value) => value + 1)}
            >
              렌더링 다시 시도
            </Button>
          </Stack>
        )}
        <iframe
          ref={frameRef}
          title={title}
          sandbox={!inert ? "allow-same-origin" : ""}
          onLoad={(event) => loaded(event.currentTarget)}
          referrerPolicy="no-referrer"
          srcDoc={source ?? ""}
          style={{
            width: "100%",
            height: "65vh",
            border: 0,
            background: "white",
          }}
        />
      </Stack>
    </Paper>
  );
}

export function Comparison({
  japanese,
  korean,
}: {
  japanese: string;
  korean: string;
}) {
  const [sync, setSync] = useState(false);
  const [left, setLeft] = useState<Document>();
  const [right, setRight] = useState<Document>();
  useComparisonScroll(sync, left, right);
  return (
    <Stack>
      <Checkbox
        label="제목 기준 스크롤 동기화"
        checked={sync}
        onChange={(event) => setSync(event.currentTarget.checked)}
      />
      <SimpleGrid cols={{ base: 1, xl: 2 }}>
        <Preview
          html={japanese}
          title="일본어 원문"
          onFrame={(frame) => setLeft(frame.contentDocument ?? undefined)}
        />
        <Preview
          html={korean}
          title="한국어 번역"
          onFrame={(frame) => setRight(frame.contentDocument ?? undefined)}
        />
      </SimpleGrid>
    </Stack>
  );
}

import { Checkbox, Paper, SimpleGrid, Stack, Text } from "@mantine/core";
import { useMemo, useState } from "react";
import { previewDocument } from "./preview-document.ts";
import { useComparisonScroll } from "./use-comparison-scroll.ts";

export function Preview({
  html,
  title,
  inert = false,
  onFrame,
}: {
  html: string;
  title: string;
  inert?: boolean;
  onFrame?: (frame: HTMLIFrameElement) => void;
}) {
  const source = useMemo(() => previewDocument(html, inert), [html, inert]);
  return (
    <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
      <Stack gap={0}>
        <Text fw={600} p="sm" bg="gray.0">
          {title}
        </Text>
        <iframe
          title={title}
          sandbox={onFrame && !inert ? "allow-same-origin" : ""}
          onLoad={(event) => onFrame?.(event.currentTarget)}
          referrerPolicy="no-referrer"
          srcDoc={source}
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

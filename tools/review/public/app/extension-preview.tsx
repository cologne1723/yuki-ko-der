import { Badge, Button, Group, Paper, Stack, Text } from "@mantine/core";
import type { TranslationEntry } from "translation-core/fixed-translations";

/** Extension-owned UI has no corresponding element in saved website pages. */
export function ExtensionPreview({
  entry,
  text,
}: {
  entry: TranslationEntry;
  text: string;
}) {
  const toolbar = entry.selector.includes("_toolbar_");
  const retry = entry.selector.endsWith("_retry");
  return (
    <Paper withBorder p="lg">
      <Stack>
        <Text size="sm" c="dimmed">
          확장 기능 미리보기 · 표시 예시
        </Text>
        {toolbar ? (
          <Group>
            <Badge color={entry.selector.endsWith("_korean") ? "blue" : "red"}>
              {entry.selector.endsWith("_korean") ? "KO" : "JA"}
            </Badge>
            <Text style={{ outline: "2px solid #228be6" }}>{text}</Text>
          </Group>
        ) : retry ? (
          <Button
            variant="default"
            style={{ alignSelf: "start", outline: "2px solid #228be6" }}
          >
            {text}
          </Button>
        ) : (
          <Text
            component="p"
            role="status"
            style={{
              fontSize: "0.9em",
              margin: "0.5em 0",
              outline: "2px solid #228be6",
            }}
          >
            {text}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}

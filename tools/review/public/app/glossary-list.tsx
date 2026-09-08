import {
  Button,
  Grid,
  Group,
  NavLink,
  Pagination,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { type ReviewDictionary } from "translation-core/ui-review-groups";
import { reviewApi } from "./client.ts";
import { GlossaryEditor } from "./glossary-editor.tsx";
import {
  Empty,
  Failure,
  Pending,
  ReviewBadge,
  useApi,
  useDocumentTitle,
} from "./shared.tsx";

export interface GlossaryData {
  dictionaries: ReviewDictionary[];
  pages: string[];
  coverage?: {
    file: string;
    index: number;
    source?: string;
    pages: string[];
  }[];
  sourceContexts: {
    file: string;
    source: string;
    selector: string;
    url: string;
    evidenceUrl?: string;
    state: string;
    kind: string;
  }[];
}

export function Glossary() {
  useDocumentTitle("UI 용어집");
  const query = useApi("/api/ui", (signal) => reviewApi.glossary(signal));
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [dictionary, setDictionary] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const rows = useMemo(() => {
    const seen = new Set<string>();
    return (query.data?.dictionaries ?? [])
      .flatMap((d) =>
        d.entries.map((entry, index) => ({ dictionary: d, entry, index })),
      )
      .filter((row) => {
        if (dictionary && dictionary !== row.dictionary.file) return false;
        const key = row.entry.messageId
          ? `${row.entry.messageId}:${row.entry.variant ?? "base"}`
          : `${row.dictionary.file}:${row.index}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return (
          (!status || row.entry.reviewStatus === status) &&
          `${row.entry.source} ${row.entry.target}`
            .toLowerCase()
            .includes(search.toLowerCase())
        );
      });
  }, [query.data, dictionary, status, search]);
  useEffect(() => {
    const first = rows[0];
    if (!location.hash && first)
      void navigate(`/ui#${first.dictionary.file}:${first.index}`, {
        replace: true,
      });
  }, [location.hash, rows, navigate]);
  let key = "";
  try {
    key = decodeURIComponent(location.hash.slice(1));
  } catch {
    /* Invalid bookmarks fall back to the list. */
  }
  const match = /^([\w-]+\.json):(\d+)$/.exec(key);
  const selectedDictionary = query.data?.dictionaries.find(
    (d) => d.file === match?.[1],
  );
  const selected =
    selectedDictionary && match
      ? {
          dictionary: selectedDictionary,
          index: Number(match[2]),
          entry: selectedDictionary.entries[Number(match[2])],
        }
      : rows[0];
  return (
    <Stack>
      <Group justify="space-between">
        <Title order={1}>UI 용어집</Title>
        <Button component={Link} to="/ui?view=imports" variant="light">
          ZIP 가져오기
        </Button>
      </Group>
      <Failure error={query.error} retry={() => void query.refetch()} />
      {query.isPending ? (
        <Pending />
      ) : (
        <Grid gap="lg">
          <Grid.Col span={{ base: 12, lg: 3 }}>
            <Paper withBorder p="md">
              <Stack>
                <TextInput
                  label="문구 검색"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.currentTarget.value);
                    setPage(1);
                  }}
                />
                <Select
                  label="사전"
                  searchable
                  clearable
                  value={dictionary}
                  onChange={(v) => {
                    setDictionary(v);
                    setPage(1);
                  }}
                  data={query.data?.dictionaries.map((d) => d.file) ?? []}
                />
                <Select
                  label="검수 상태"
                  clearable
                  value={status}
                  onChange={(v) => {
                    setStatus(v);
                    setPage(1);
                  }}
                  data={[
                    { value: "unreviewed", label: "미검수" },
                    { value: "approved", label: "승인됨" },
                  ]}
                />
                <Text size="sm" c="dimmed">
                  {rows.length}개 문구
                </Text>
                {rows.slice((page - 1) * 12, page * 12).map((row) => (
                  <NavLink
                    key={`${row.dictionary.file}:${row.index}`}
                    component={Link}
                    to={`/ui#${row.dictionary.file}:${row.index}`}
                    active={
                      selected?.dictionary.file === row.dictionary.file &&
                      selected.index === row.index
                    }
                    label={row.entry.target}
                    description={row.entry.source}
                    rightSection={
                      <ReviewBadge
                        status={row.entry.reviewStatus ?? "unreviewed"}
                      />
                    }
                  />
                ))}
                <Pagination
                  value={page}
                  onChange={setPage}
                  total={Math.max(1, Math.ceil(rows.length / 12))}
                />
              </Stack>
            </Paper>
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 9 }}>
            {selected?.entry && query.data ? (
              <GlossaryEditor
                key={`${selected.dictionary.file}:${selected.index}`}
                initial={selected.entry}
                dictionary={selected.dictionary}
                index={selected.index}
                data={query.data}
              />
            ) : (
              <Empty>문구를 선택하세요.</Empty>
            )}
          </Grid.Col>
        </Grid>
      )}
    </Stack>
  );
}

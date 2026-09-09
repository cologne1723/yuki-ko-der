import {
  Alert,
  Button,
  FileInput,
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
import { modals } from "@mantine/modals";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { CollectionSummary } from "../../src/collection-types.ts";
import type { ImportTask } from "../../src/ui-imports.ts";
import { reviewApi } from "./client.ts";
import { ImportEditor } from "./import-editor.tsx";
import {
  Empty,
  Failure,
  Pending,
  ReviewBadge,
  reviewLabels,
  useApi,
  useDocumentTitle,
} from "./shared.tsx";

export interface ImportList {
  tasks: ImportTask[];
  collections: CollectionSummary[];
  selected?: string;
  collection?: string;
}

export function Imports() {
  useDocumentTitle("ZIP 가져오기");
  const query = useApi("/api/ui/imports", (signal) =>
    reviewApi.imports(signal),
  );
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [files, setFiles] = useState<File[]>([]);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const collection = params.get("collection") ?? "";
  const rows = (query.data?.tasks ?? []).filter(
    (t) =>
      (!collection || t.locations.some((l) => l.collectionId === collection)) &&
      (!status || t.status === status) &&
      `${t.source} ${t.target}`.toLowerCase().includes(search.toLowerCase()),
  );
  const selected =
    (params.has("item") ? query.data?.tasks : rows)?.find(
      (t) => t.id === (params.get("item") ?? query.data?.selected),
    ) ?? rows[0];
  useEffect(() => {
    if (selected && !params.has("item"))
      setParams(
        {
          view: "imports",
          item: selected.id,
          ...(collection ? { collection } : {}),
        },
        { replace: true },
      );
  }, [selected?.id, params, setParams, collection]);
  const selection = useMutation({
    scope: { id: "import-selection" },
    mutationFn: (value: { id: string; collection: string }) =>
      reviewApi.selectImport(value),
  });
  const persistSelection = selection.mutate;
  useEffect(() => {
    if (selected) persistSelection({ id: selected.id, collection });
  }, [selected?.id, collection, persistSelection]);
  const refreshCollections = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ["/api/ui/imports"] }),
      client.invalidateQueries({ queryKey: ["/api/ui"] }),
    ]);
  const upload = useMutation({
    mutationFn: async () => {
      const results = [];
      for (const file of files) {
        try {
          if (file.size > 128 * 1024 * 1024)
            throw new Error("ZIP 파일이 너무 큽니다.");
          const response = await fetch("/api/collections", {
            method: "POST",
            headers: { "content-type": "application/zip" },
            body: file,
          });
          const result = await response.json();
          if (!response.ok)
            throw new Error(result.error ?? `HTTP ${response.status}`);
          results.push({
            name: file.name,
            message: result.duplicate ? "이미 가져온 자료" : "가져오기 완료",
            ok: true,
          });
        } catch (error) {
          results.push({ name: file.name, message: String(error), ok: false });
        }
      }
      return results;
    },
    onSuccess: refreshCollections,
  });
  const remove = useMutation({
    mutationFn: () => reviewApi.deleteCollection(collection),
    onSuccess: async () => {
      setParams({ view: "imports" });
      await refreshCollections();
    },
  });
  return (
    <Stack>
      <Group justify="space-between">
        <Title order={1}>ZIP 가져오기</Title>
        <Button component={Link} to="/ui" variant="light">
          용어집
        </Button>
      </Group>
      <Paper withBorder p="md">
        <Stack>
          <FileInput
            label="수집한 ZIP 파일"
            accept=".zip,application/zip"
            multiple
            clearable
            value={files}
            onChange={setFiles}
          />
          <Button
            disabled={!files.length}
            loading={upload.isPending}
            onClick={() => upload.mutate()}
          >
            가져오기
          </Button>
          <Failure error={upload.error} />
          {upload.data?.map((r, i) => (
            <Alert key={i} color={r.ok ? "teal" : "red"}>
              {r.name}: {r.message}
            </Alert>
          ))}
        </Stack>
      </Paper>
      <Failure
        error={query.error ?? remove.error ?? selection.error}
        retry={() => void query.refetch()}
      />
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
                  label="수집 자료"
                  clearable
                  value={collection || null}
                  onChange={(v) => {
                    setParams({
                      view: "imports",
                      ...(v ? { collection: v } : {}),
                    });
                    setPage(1);
                  }}
                  data={
                    query.data?.collections.map((c) => ({
                      value: c.id,
                      label: c.id,
                    })) ?? []
                  }
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
                    "new",
                    "draft",
                    "approved",
                    "needs-check",
                    "deferred",
                    "excluded",
                  ].map((value) => ({ value, label: reviewLabels[value] }))}
                />
                <Group>
                  <Button
                    variant="default"
                    onClick={() => void query.refetch()}
                  >
                    새로고침
                  </Button>
                  <Button
                    color="red"
                    variant="light"
                    disabled={!collection || dirty}
                    loading={remove.isPending}
                    onClick={() =>
                      modals.openConfirmModal({
                        title: "수집 자료 삭제",
                        children: (
                          <Text>
                            선택한 수집 자료를 삭제할까요? 저장된 번역은
                            유지됩니다.
                          </Text>
                        ),
                        labels: { confirm: "자료 삭제", cancel: "취소" },
                        onConfirm: () => remove.mutate(),
                      })
                    }
                  >
                    자료 삭제
                  </Button>
                </Group>
                {rows.slice((page - 1) * 12, page * 12).map((t) => (
                  <NavLink
                    key={t.id}
                    component={Link}
                    to={`/ui?${new URLSearchParams({ view: "imports", item: t.id, ...(collection ? { collection } : {}) })}`}
                    active={selected?.id === t.id}
                    label={t.target || t.source}
                    description={t.source}
                    rightSection={<ReviewBadge status={t.status} />}
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
            {selected ? (
              <ImportEditor
                key={selected.id}
                initial={selected}
                onDirty={setDirty}
                next={rows[rows.findIndex((t) => t.id === selected.id) + 1]?.id}
                collection={collection}
              />
            ) : (
              <Empty>ZIP을 가져오면 수집한 문구를 검수할 수 있습니다.</Empty>
            )}
          </Grid.Col>
        </Grid>
      )}
    </Stack>
  );
}

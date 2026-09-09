import {
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Pagination,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { reviewApi } from "./client.ts";
import { Failure, Pending, UnsavedGuard } from "./shared.tsx";

type TagData = Awaited<ReturnType<typeof reviewApi.tags>>;
type Tag = TagData["tags"][number];

export function Tags() {
  const query = useQuery({
    queryKey: ["tags"],
    queryFn: ({ signal }) => reviewApi.tags(signal),
    refetchOnWindowFocus: false,
  });
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState("");
  if (query.isPending) return <Pending />;
  if (query.isError)
    return (
      <Stack>
        <Failure error={query.error} />
        <Button onClick={() => void query.refetch()}>다시 시도</Button>
      </Stack>
    );
  const data = query.data;
  const selected = params.has("tag")
    ? data.tags.find((t) => t.source === params.get("tag"))
    : data.tags[0];
  const matching = data.tags.filter(
    (t) =>
      (status === "all" || t.reviewStatus === status) &&
      [t.source, t.target, t.solvedAcKey ?? ""].some((v) =>
        v.toLowerCase().includes(search.toLowerCase()),
      ),
  );
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(matching.length / 25)),
  );
  const approved = data.tags.filter(
    (t) => t.reviewStatus === "approved",
  ).length;
  return (
    <Stack>
      <Title order={1}>태그 번역</Title>
      <Text c="dimmed">
        원문 태그와 한국어 번역을 비교하고 검토하세요. 저장과 승인은 별도로
        처리됩니다.
      </Text>
      <Group>
        <Badge variant="light">전체 {data.tags.length}개</Badge>
        <Badge color="green" variant="light">
          승인 {approved}개
        </Badge>
        <Badge color="orange" variant="light">
          미검토 {data.tags.length - approved}개
        </Badge>
      </Group>
      {notice && (
        <Text role="status" c="green">
          {notice}
        </Text>
      )}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <Card withBorder>
          <Stack>
            <TextInput
              label="태그 검색"
              placeholder="원문, 한국어 또는 solved.ac 태그"
              value={search}
              onChange={(e) => {
                setSearch(e.currentTarget.value);
                setPage(1);
                setNotice("");
              }}
            />
            <Select
              label="검토 상태"
              value={status}
              allowDeselect={false}
              onChange={(v) => {
                setStatus(v ?? "all");
                setPage(1);
                setNotice("");
              }}
              data={[
                { value: "all", label: "전체" },
                { value: "unreviewed", label: "미검토" },
                { value: "approved", label: "승인됨" },
              ]}
            />
            <Text size="sm">검색 결과 {matching.length}개</Text>
            <Table.ScrollContainer minWidth={380}>
              <Table highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>원문 태그</Table.Th>
                    <Table.Th>한국어</Table.Th>
                    <Table.Th>문제 수</Table.Th>
                    <Table.Th>상태</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {matching
                    .slice((currentPage - 1) * 25, currentPage * 25)
                    .map((tag) => (
                      <Table.Tr
                        key={tag.source}
                        style={{ cursor: "pointer" }}
                        onClick={() => {
                          setNotice("");
                          setParams({ tag: tag.source });
                        }}
                        bg={
                          tag.source === selected?.source
                            ? "var(--mantine-color-indigo-light)"
                            : undefined
                        }
                      >
                        <Table.Td>
                          <Anchor
                            component="button"
                            aria-current={
                              tag.source === selected?.source
                                ? "true"
                                : undefined
                            }
                          >
                            {tag.source}
                          </Anchor>
                        </Table.Td>
                        <Table.Td>{tag.target}</Table.Td>
                        <Table.Td>{tag.problemCount}</Table.Td>
                        <Table.Td>
                          {tag.reviewStatus === "approved"
                            ? "승인됨"
                            : "미검토"}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            {!matching.length && (
              <Text c="dimmed">조건에 맞는 태그가 없습니다.</Text>
            )}
            <Pagination
              total={Math.max(1, Math.ceil(matching.length / 25))}
              value={currentPage}
              onChange={setPage}
            />
          </Stack>
        </Card>
        {selected ? (
          <TagEditor
            key={selected.source}
            initial={selected}
            revision={data.revision}
            onReviewed={(updated, original) => {
              // Use the list from before approval: the current row can disappear
              // from an unreviewed filter or a search after its wording changes.
              const index = matching.findIndex(
                (t) => t.source === selected.source,
              );
              const ordered =
                index < 0
                  ? matching
                  : [...matching.slice(index + 1), ...matching.slice(0, index)];
              const next = ordered.find((tag) =>
                updated.tags.some(
                  (t) =>
                    t.source === tag.source &&
                    t.source !== selected.source &&
                    t.reviewStatus === "unreviewed",
                ),
              );
              if (!next) {
                setNotice(
                  original
                    ? "원문 그대로 표시하도록 번역 항목을 삭제했습니다. 현재 목록에 다음 미검토 태그가 없습니다."
                    : "현재 목록에 다음 미검토 태그가 없습니다.",
                );
                if (original)
                  setParams({ tag: selected.source }, { replace: true });
                return;
              }
              const visible = updated.tags.filter(
                (t) =>
                  (status === "all" || t.reviewStatus === status) &&
                  [t.source, t.target, t.solvedAcKey ?? ""].some((v) =>
                    v.toLowerCase().includes(search.toLowerCase()),
                  ),
              );
              setPage(
                Math.floor(
                  visible.findIndex((t) => t.source === next.source) / 25,
                ) + 1,
              );
              setNotice(
                original
                  ? "원문 그대로 표시하도록 번역 항목을 삭제했습니다."
                  : "승인했습니다.",
              );
              setParams({ tag: next.source }, { replace: true });
            }}
          />
        ) : (
          <Text>
            {data.tags.length
              ? "목록에서 검토할 태그를 선택하세요."
              : "등록된 태그가 없습니다."}
          </Text>
        )}
      </SimpleGrid>
    </Stack>
  );
}

function TagEditor({
  initial,
  revision,
  onReviewed,
}: {
  initial: Tag;
  revision: string;
  onReviewed: (data: TagData, original?: boolean) => void;
}) {
  const [saved, setSaved] = useState(initial);
  const [target, setTarget] = useState(initial.target);
  const [baseRevision, setBaseRevision] = useState(revision);
  const [message, setMessage] = useState("");
  const client = useQueryClient();
  const [advance, setAdvance] = useState<(() => void) | null>(null);
  const dirty = target !== saved.target;
  const mutation = useMutation({
    mutationFn: ({
      action,
    }: {
      action: "save" | "approve" | "unapprove" | "original";
      advance?: (data: TagData, original?: boolean) => void;
    }) =>
      action === "original"
        ? reviewApi.deleteTag(saved.source, baseRevision)
        : reviewApi.saveTag(saved.source, {
            target,
            revision: baseRevision,
            action,
          }),
    onSuccess: (data, { action, advance }) => {
      const updated = data.tags.find((t) => t.source === saved.source) ?? saved;
      setSaved(updated);
      setTarget(updated.target);
      setBaseRevision(data.revision);
      if (advance)
        setAdvance(() => () => {
          client.setQueryData(["tags"], data);
          advance(data, action === "original");
        });
      else client.setQueryData(["tags"], data);
      setMessage(
        action === "approve"
          ? "승인했습니다."
          : action === "unapprove"
            ? "승인을 취소했습니다."
            : "저장했습니다.",
      );
    },
  });
  useEffect(() => {
    if (advance && !dirty && !mutation.isPending) {
      setAdvance(null);
      advance();
    }
  }, [advance, dirty, mutation.isPending]);
  return (
    <Card withBorder style={{ alignSelf: "start" }}>
      <Stack>
        <UnsavedGuard dirty={dirty} pending={mutation.isPending} />
        <Group justify="space-between">
          <Title order={2}>{saved.source}</Title>
          <Badge color={saved.reviewStatus === "approved" ? "green" : "orange"}>
            {saved.reviewStatus === "approved" ? "승인됨" : "미검토"}
          </Badge>
        </Group>
        <Text size="sm" c="dimmed">
          문제 수 {saved.problemCount}개 · 수집 시점 기준
        </Text>
        <Group>
          <Anchor
            href={`https://yukicoder.me/problems?tags=${encodeURIComponent(saved.source)}`}
            target="_blank"
            rel="noreferrer"
          >
            yukicoder 문제 보기
          </Anchor>
          {saved.solvedAcKey && (
            <Anchor
              href={`https://solved.ac/problems/tags/${encodeURIComponent(saved.solvedAcKey)}`}
              target="_blank"
              rel="noreferrer"
            >
              solved.ac 기준 태그: {saved.solvedAcKey}
            </Anchor>
          )}
        </Group>
        <Textarea
          label="한국어 번역"
          autosize
          minRows={2}
          value={target}
          disabled={mutation.isPending}
          onChange={(e) => {
            setTarget(e.currentTarget.value);
            setMessage("");
          }}
        />
        <Text size="sm" c="dimmed">
          번역을 수정해 저장하면 미검토 상태가 됩니다. 승인 버튼을 눌러야
          승인됩니다.
        </Text>
        <Text size="sm" c="dimmed">
          「원문 그대로 두기」는 이 번역 항목을 삭제합니다. 해당 태그는 원문으로
          표시됩니다.
        </Text>
        <Group>
          <Button
            variant="light"
            color="gray"
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate({ action: "original", advance: onReviewed })
            }
          >
            원문 그대로 두기
          </Button>
          <Button
            variant="default"
            disabled={!target.trim() || mutation.isPending}
            onClick={() => mutation.mutate({ action: "save" })}
          >
            저장
          </Button>
          <Button
            disabled={!target.trim() || mutation.isPending}
            onClick={() =>
              mutation.mutate({ action: "approve", advance: onReviewed })
            }
          >
            승인하고 다음
          </Button>
          <Button
            variant="subtle"
            color="orange"
            disabled={
              saved.reviewStatus !== "approved" || mutation.isPending || dirty
            }
            onClick={() => mutation.mutate({ action: "unapprove" })}
          >
            승인 취소
          </Button>
          <Button
            variant="subtle"
            disabled={!dirty || mutation.isPending}
            onClick={() => {
              setTarget(saved.target);
              setMessage("");
              mutation.reset();
            }}
          >
            편집 되돌리기
          </Button>
        </Group>
        {mutation.isPending && <Text role="status">저장 중입니다.</Text>}
        {message && (
          <Text role="status" c="green">
            {message}
          </Text>
        )}
        {mutation.error && <Failure error={mutation.error} />}
      </Stack>
    </Card>
  );
}

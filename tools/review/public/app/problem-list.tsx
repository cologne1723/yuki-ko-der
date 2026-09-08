import {
  Grid,
  NavLink,
  Pagination,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { reviewApi } from "./client.ts";
import { ProblemEditor } from "./problem-editor.tsx";
import {
  Empty,
  Failure,
  Pending,
  ReviewBadge,
  useApi,
  useDocumentTitle,
} from "./shared.tsx";
import { QuickTasks } from "./tasks.tsx";

export function Problems() {
  useDocumentTitle("문제 검수");
  const query = useApi("/api/problems", (signal) => reviewApi.problems(signal));
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string | null>("all");
  const [page, setPage] = useState(1);
  const list = (query.data?.problems ?? []).filter(
    (p) =>
      (status === "all" || p.reviewStatus === status) &&
      `${p.problemNo} ${p.japaneseTitle} ${p.koreanTitle}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const selected =
    params.get("problem") ?? String(query.data?.problems[0]?.problemNo ?? "");
  useEffect(() => {
    if (!params.has("problem") && selected)
      setParams({ problem: selected }, { replace: true });
  }, [params, selected, setParams]);
  return (
    <Stack>
      <Title order={1}>문제 검수</Title>
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: 3 }}>
          <Paper withBorder p="md">
            <Stack>
              <TextInput
                label="문제 검색"
                placeholder="번호 또는 제목"
                value={search}
                onChange={(e) => {
                  setSearch(e.currentTarget.value);
                  setPage(1);
                }}
              />
              <Select
                label="검수 상태"
                value={status}
                onChange={(v) => {
                  setStatus(v);
                  setPage(1);
                }}
                data={[
                  { value: "all", label: "전체" },
                  { value: "unreviewed", label: "미검수" },
                  { value: "approved", label: "승인됨" },
                ]}
              />
              <Failure error={query.error} retry={() => void query.refetch()} />
              {query.isPending ? (
                <Pending />
              ) : (
                <>
                  <Text size="sm" c="dimmed">
                    {list.length}개 문제
                  </Text>
                  {list.slice((page - 1) * 12, page * 12).map((p) => (
                    <NavLink
                      key={p.problemNo}
                      component={Link}
                      to={`/?problem=${p.problemNo}`}
                      active={selected === String(p.problemNo)}
                      label={`${p.problemNo}. ${p.koreanTitle || p.japaneseTitle}`}
                      description={p.japaneseTitle}
                      rightSection={
                        <ReviewBadge
                          status={
                            p.validationErrors?.length
                              ? "invalid"
                              : p.reviewStatus === "approved"
                                ? "approved"
                                : p.machineTranslated
                                  ? "machine"
                                  : "unreviewed"
                          }
                        />
                      }
                    />
                  ))}
                  <Pagination
                    value={page}
                    onChange={setPage}
                    total={Math.max(1, Math.ceil(list.length / 12))}
                  />
                </>
              )}
            </Stack>
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 9 }}>
          <Stack>
            {selected ? (
              <ProblemLoader key={selected} number={selected} />
            ) : (
              <Empty>문제가 없습니다.</Empty>
            )}
          </Stack>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}

export function ProblemLoader({ number }: { number: string }) {
  const query = useApi(`/api/problems/${number}`, (signal) =>
    reviewApi.problem(number, signal),
  );
  return (
    <>
      <Failure error={query.error} retry={() => void query.refetch()} />
      {query.error && (
        <QuickTasks kind="problem" number={Number(number)} />
      )}{" "}
      {query.isPending ? (
        <Pending />
      ) : (
        query.data && <ProblemEditor initial={query.data} />
      )}
    </>
  );
}

import {
  Button,
  Checkbox,
  FileInput,
  MultiSelect,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import type { OperationInput } from "translation-audit/operations/run";
import { reviewApi } from "./client.ts";
import { Failure, useApi } from "./shared.tsx";
import { operations, taskLabels } from "./task-model.tsx";
import { taskKeys } from "./task-queries.ts";

export function OperationForm({
  selectTask,
  running,
}: {
  selectTask: (id: string) => void;
  running: boolean;
}) {
  const [params] = useSearchParams();
  const options = useApi("/api/tools/options", (signal) =>
    reviewApi.options(signal),
  );
  const form = useForm({
    initialValues: {
      operation: operations.includes(
        params.get("operation") as OperationInput["operation"],
      )
        ? (params.get("operation") as OperationInput["operation"])
        : ("setup" as OperationInput["operation"]),
      problems: params.get("problems") ?? "",
      selection: "both" as string | null,
      refresh: false,
      page: null as string | null,
      dictionaries: [] as string[],
      fixtures: [] as File[],
      file: null as File | null,
      number: "" as string | number,
    },
  });
  const {
    operation,
    problems,
    selection,
    refresh,
    page,
    dictionaries,
    fixtures,
    file,
    number,
  } = form.values;
  const setOperation = (value: typeof operation) =>
    form.setFieldValue("operation", value);
  const setProblems = (value: typeof problems) =>
    form.setFieldValue("problems", value);
  const setSelection = (value: typeof selection) =>
    form.setFieldValue("selection", value);
  const setRefresh = (value: typeof refresh) =>
    form.setFieldValue("refresh", value);
  const setPage = (value: typeof page) => form.setFieldValue("page", value);
  const setDictionaries = (value: typeof dictionaries) =>
    form.setFieldValue("dictionaries", value);
  const setFixtures = (value: typeof fixtures) =>
    form.setFieldValue("fixtures", value);
  const setFile = (value: typeof file) => form.setFieldValue("file", value);
  const setNumber = (value: typeof number) =>
    form.setFieldValue("number", value);
  const client = useQueryClient();
  const start = useMutation({
    mutationFn: async () => {
      const input: OperationInput = { operation };
      if (
        [
          "setup",
          "audit-problems",
          "verify-problems",
          "validate-problems",
          "lint-problems",
        ].includes(operation)
      )
        input.problems =
          problems.trim() === "전체" ? undefined : problems.trim() || undefined;
      if (operation === "setup") {
        input.selection = selection as OperationInput["selection"];
        input.refresh = refresh;
      }
      if (
        ["audit-translations", "convert-problem"].includes(operation) &&
        file
      ) {
        if (file.size > 7 * 1024 * 1024)
          throw new Error("HTML 파일이 너무 큽니다.");
        input.html = await file.text();
      }
      if (operation === "audit-translations") {
        input.page = file ? undefined : (page ?? undefined);
        input.dictionaries = dictionaries;
        input.fixtures = await Promise.all(
          fixtures.map(async (f) => {
            if (f.size > 7 * 1024 * 1024)
              throw new Error("사전 파일이 너무 큽니다.");
            return JSON.parse(await f.text());
          }),
        );
      }
      if (operation === "convert-problem" && !file && number)
        input.problemNo = Number(number);
      return reviewApi.startTask(input);
    },
    onSuccess: (task) => {
      selectTask(task.id);
      void client.invalidateQueries({ queryKey: taskKeys.list });
    },
  });
  return (
    <Paper withBorder p="lg">
      <Stack>
        <Title order={2}>작업 실행</Title>
        <Select
          label="작업"
          value={operation}
          onChange={(v) => setOperation(v as OperationInput["operation"])}
          data={operations.map((value) => ({
            value,
            label: taskLabels[value],
          }))}
        />
        {[
          "setup",
          "audit-problems",
          "verify-problems",
          "validate-problems",
          "lint-problems",
        ].includes(operation) && (
          <TextInput
            label="문제 번호 또는 범위"
            placeholder="전체 또는 1,3-8"
            value={problems}
            onChange={(e) => setProblems(e.currentTarget.value)}
          />
        )}{" "}
        {operation === "setup" && (
          <>
            <Select
              label="다운로드 대상"
              value={selection}
              onChange={setSelection}
              data={[
                { value: "both", label: "둘 다" },
                { value: "problems", label: "문제 원문" },
                { value: "pages", label: "UI 미리보기" },
              ]}
            />
            <Checkbox
              label="이미 있는 자료도 새로 확인"
              checked={refresh}
              onChange={(e) => setRefresh(e.currentTarget.checked)}
            />
          </>
        )}
        {operation === "audit-translations" && (
          <>
            <Failure
              error={options.error}
              retry={() => void options.refetch()}
            />
            <Select
              label="저장 페이지"
              disabled={!!file}
              value={page}
              onChange={setPage}
              data={options.data?.pages ?? []}
              searchable
              clearable
            />
            <MultiSelect
              label="사전 선택"
              data={options.data?.dictionaries ?? []}
              value={dictionaries}
              onChange={setDictionaries}
              searchable
            />
            <FileInput
              label="추가 사전 JSON"
              multiple
              accept=".json"
              value={fixtures}
              onChange={setFixtures}
              clearable
            />
          </>
        )}
        {["audit-translations", "convert-problem"].includes(operation) && (
          <FileInput
            label="HTML 파일"
            accept=".html,text/html"
            value={file}
            onChange={setFile}
            clearable
          />
        )}
        {operation === "convert-problem" && (
          <NumberInput
            label="또는 기존 HTML 문제 번호"
            min={1}
            allowDecimal={false}
            disabled={!!file}
            value={number}
            onChange={setNumber}
          />
        )}
        <Failure error={start.error} />
        <Button
          loading={start.isPending}
          disabled={running}
          onClick={() => start.mutate()}
        >
          실행
        </Button>
        {running && (
          <Text size="sm">
            실행 중인 작업이 끝나면 새 작업을 시작할 수 있습니다.
          </Text>
        )}
      </Stack>
    </Paper>
  );
}

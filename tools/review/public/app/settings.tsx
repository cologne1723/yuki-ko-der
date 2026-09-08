import {
  Alert,
  Button,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { reviewApi } from "./client.ts";
import { Failure, UnsavedGuard, useApi } from "./shared.tsx";

export function Settings() {
  const query = useApi("/api/settings", (signal) => reviewApi.settings(signal));
  return (
    <Paper withBorder p="lg">
      <Title order={2}>자료 폴더</Title>
      <Failure error={query.error} retry={() => void query.refetch()} />
      {query.data && <SettingsForm initial={query.data} />}
    </Paper>
  );
}

export function SettingsForm({
  initial,
}: {
  initial: { activeDataDirectory: string; nextDataDirectory: string };
}) {
  const form = useForm({
    initialValues: { directory: initial.nextDataDirectory },
  });
  const directory = form.values.directory;
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: () => reviewApi.saveSettings({ dataDirectory: directory }),
    onSuccess: (result) => {
      client.setQueryData(["/api/settings"], result);
      form.setValues({ directory: result.nextDataDirectory });
      form.resetDirty({ directory: result.nextDataDirectory });
    },
  });
  return (
    <Stack mt="md">
      <UnsavedGuard dirty={form.isDirty()} pending={save.isPending} />
      <Text size="sm">사용 중: {initial.activeDataDirectory}</Text>
      <TextInput
        label="다음 시작에 사용할 폴더"
        {...form.getInputProps("directory")}
        disabled={save.isPending}
      />
      <Button loading={save.isPending} onClick={() => save.mutate()}>
        설정 저장
      </Button>
      <Failure error={save.error} />
      {save.isSuccess && (
        <Alert color="teal">
          {save.data.restartRequired
            ? "저장했습니다. 서버를 다시 시작하면 선택한 폴더를 사용합니다. 기존 자료는 자동으로 이동하지 않습니다."
            : "설정을 저장했습니다."}
        </Alert>
      )}
    </Stack>
  );
}

import { Button } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { TaskDrawer } from "./task-drawer.tsx";
import { active, taskLabels } from "./task-model.tsx";
import { tasksQueryOptions } from "./task-queries.ts";

export function TaskMonitor() {
  const [id, setId] = useState<string>();
  const query = useQuery(tasksQueryOptions(true));
  const running = query.data?.find((task) => active(task.status));
  const resumed = useRef(false);
  useEffect(() => {
    if (!resumed.current && query.data) {
      resumed.current = true;
      if (running) setId(running.id);
    }
  }, [query.data, running]);
  return (
    <>
      <Button
        variant="subtle"
        component={Link}
        to="/tools"
        style={{ minWidth: 0, flexShrink: 1 }}
        styles={{ label: { display: "block", textOverflow: "ellipsis" } }}
      >
        {query.error
          ? "작업 연결 끊김 · 다시 확인"
          : running
            ? `${taskLabels[running.input.operation]} · ${taskLabels[running.status]}`
            : "작업 기록"}
      </Button>
      <TaskDrawer id={id} onClose={() => setId(undefined)} onStarted={setId} />
    </>
  );
}

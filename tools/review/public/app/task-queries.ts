import { queryOptions } from "@tanstack/react-query";
import { reviewApi } from "./client.ts";
import { active } from "./task-state.ts";

export const taskKeys = {
  list: ["/api/tasks"],
  detail: (id?: string) => [`/api/tasks/${id}`],
};
export function tasksQueryOptions(monitor = false) {
  return queryOptions({
    queryKey: taskKeys.list,
    queryFn: ({ signal }) => reviewApi.tasks(signal),
    refetchInterval: (query) =>
      monitor
        ? 3000
        : query.state.data?.some((task) => active(task.status))
          ? 2000
          : false,
  });
}
export function taskQueryOptions(id?: string) {
  return queryOptions({
    queryKey: taskKeys.detail(id),
    queryFn: ({ signal }) => reviewApi.task(id ?? "", signal),
    enabled: !!id,
    refetchInterval: (query) =>
      active(query.state.data?.status) ? 1000 : false,
  });
}

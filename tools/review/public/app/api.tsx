import { queryOptions, useQuery } from "@tanstack/react-query";

export function apiQueryOptions<T>(
  path: string,
  request: (signal: AbortSignal) => Promise<T>,
) {
  return queryOptions({
    queryKey: [path],
    queryFn: ({ signal }) => request(signal),
  });
}
export function useApi<T>(
  path: string,
  request: (signal: AbortSignal) => Promise<T>,
  enabled = true,
) {
  return useQuery({ ...apiQueryOptions(path, request), enabled });
}

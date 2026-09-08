export interface OperationItem {
  id: string;
  status: "passed" | "saved" | "skipped" | "failed" | "review-required";
  message: string;
  reviewStatus?: "machine" | "unreviewed" | "approved";
  details?: unknown;
  location?: { dictionary: string; index: number };
}
export interface OperationContext {
  repositoryRoot: string;
  dataRoot: string;
  problems?: number[];
  refresh?: boolean;
  signal?: AbortSignal;
  progress?: (item: OperationItem) => void;
  request?: typeof fetch;
}
export interface OperationResult {
  operation: string;
  items: OperationItem[];
  report?: string;
}
export function problemSelection(value?: string): number[] | undefined {
  if (value === undefined || value === "" || value === "all") return undefined;
  const selected = new Set<number>();
  for (const group of value.split(",")) {
    if (!/^\d+(?:-\d+)?$/.test(group))
      throw new Error("Use problem numbers or ranges, separated by commas");
    const [start, end = start] = group.split("-").map(Number);
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 1 ||
      end < start ||
      end - start > 100000
    )
      throw new Error("Invalid problem range");
    for (let no = start; no <= end; no++) selected.add(no);
  }
  return [...selected].sort((a, b) => a - b);
}

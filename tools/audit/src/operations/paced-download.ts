import { readFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import { atomicFile } from "translation-core/atomic-file";
import type { OperationContext } from "./types.ts";

export interface CollectionOptions {
  intervalMs?: number;
  attempts?: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export function retryAfterMilliseconds(
  value: string | null,
  now: number,
): number {
  if (!value) return 0;
  const numeric = /^\d+$/u.test(value.trim())
    ? Number(value.trim()) * 1000
    : undefined;
  const delay = numeric ?? Date.parse(value) - now;
  return Number.isSafeInteger(delay) ? Math.max(0, delay) : 0;
}

/** Call serially under the collection lock. The cooldown survives process exit. */
export async function pacedDownload(
  context: OperationContext,
  statePath: string,
  options: CollectionOptions = {},
) {
  const intervalMs = options.intervalMs ?? 3000;
  const attempts = options.attempts ?? 5;
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1000)
    throw new Error("Collection interval must be at least 1000 ms");
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 10)
    throw new Error("Collection attempts must be between 1 and 10");
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ??
    ((milliseconds: number) =>
      setTimeout(milliseconds, undefined, { signal: context.signal }));
  let nextRequestAt = 0;
  try {
    const state = JSON.parse(await readFile(statePath, "utf8"));
    if (!Number.isSafeInteger(state.nextRequestAt) || state.nextRequestAt < 0)
      throw new Error("Invalid collection request checkpoint");
    nextRequestAt = state.nextRequestAt;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const defer = async (milliseconds: number) => {
    nextRequestAt = Math.max(nextRequestAt, now() + milliseconds);
    await atomicFile(statePath, JSON.stringify({ nextRequestAt }) + "\n");
  };
  return async (
    url: string,
    accept?: "text/html" | "application/json",
  ): Promise<Uint8Array> => {
    if (process.env.GITHUB_ACTIONS === "true" && !context.request)
      throw new Error(
        "Live yukicoder downloads are forbidden in GitHub Actions; use committed offline publication data",
      );
    let failure: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
      while (nextRequestAt > now()) {
        context.signal?.throwIfAborted();
        await sleep(Math.min(30000, nextRequestAt - now()));
      }
      context.signal?.throwIfAborted();
      await defer(intervalMs);
      let retryable = true;
      try {
        const signal = context.signal
          ? AbortSignal.any([context.signal, AbortSignal.timeout(30000)])
          : AbortSignal.timeout(30000);
        const response = await (context.request ?? fetch)(url, {
          signal,
          redirect: "error",
          headers: {
            "User-Agent": "yukicoder-ko-ground-truth-collector",
            ...(accept ? { Accept: accept } : {}),
          },
        });
        if (!response.ok) {
          await defer(
            retryAfterMilliseconds(response.headers.get("retry-after"), now()),
          );
          retryable =
            response.status === 408 ||
            response.status === 429 ||
            response.status >= 500;
          await response.body?.cancel();
          throw new Error(`HTTP ${response.status}: ${url}`);
        }
        if (response.url && response.url !== url) {
          retryable = false;
          await response.body?.cancel();
          throw new Error(`Unexpected response URL: ${response.url}`);
        }
        const contentType = response.headers
          .get("content-type")
          ?.split(";", 1)[0]
          .trim()
          .toLowerCase();
        if (accept && contentType && contentType !== accept) {
          retryable = false;
          await response.body?.cancel();
          throw new Error(
            `Expected ${accept}, received ${contentType}: ${url}`,
          );
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        await defer(intervalMs);
        return bytes;
      } catch (error) {
        context.signal?.throwIfAborted();
        failure = error;
        if (!retryable) throw error;
        await defer(Math.min(300000, intervalMs * 2 ** (attempt + 1)));
      }
    }
    throw failure;
  };
}

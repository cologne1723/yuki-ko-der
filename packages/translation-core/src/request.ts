// Keep the deadline active until the entire body is consumed, including servers
// that send headers and then stop. No timer or request starts at import time.
export async function fetchBuffered(
  url: string | URL,
  options: RequestInit = {},
  timeout = 10_000,
  request: typeof fetch = globalThis.fetch,
): Promise<Response> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  try {
    return await Promise.race([
      (async () => {
        const response = await request(url, {
          ...options,
          signal: controller.signal,
        });
        const bytes = await response.arrayBuffer();
        return new Response(
          [101, 204, 205, 304].includes(response.status) ? null : bytes,
          {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          },
        );
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(
            `Request exceeded ${timeout} ms while receiving ${String(url)}`,
          );
          controller.abort(error);
          reject(error);
        }, timeout);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}

import assert from "node:assert/strict";
import test from "node:test";
import { fetchBuffered } from "../src/request.ts";
for (const kind of ["text", "json", "arrayBuffer"] as const) {
  test(`deadline includes stalled ${kind} response bodies`, async () => {
    let signal: AbortSignal | undefined;
    const request: typeof fetch = async (_url, options) => {
      signal = options?.signal ?? undefined;
      return new Response(
        new ReadableStream({
          start(stream) {
            stream.enqueue(new TextEncoder().encode("{"));
            signal?.addEventListener("abort", () =>
              stream.error(signal?.reason),
            );
          },
        }),
      );
    };
    await assert.rejects(
      async () =>
        (await fetchBuffered("https://example.test", {}, 20, request))[kind](),
      /exceeded/,
    );
    assert.equal(signal?.aborted, true);
  });
}
test("buffering preserves exact response bytes", async () => {
  const bytes = new Uint8Array([0, 255, 10, 32]);
  const response = await fetchBuffered(
    "https://example.test",
    {},
    100,
    async () => new Response(bytes),
  );
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
});

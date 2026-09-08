import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDirectory } from "translation-core/paths";
import { createReviewServer } from "./review-server.ts";
const root = await mkdtemp(join(tmpdir(), "review-smoke-"));
await mkdir(join(root, "translations/ko"), { recursive: true });
await mkdir(join(root, "problem-translations/ko/problems"), {
  recursive: true,
});
await writeFile(
  join(root, "translations/ko.messages.json"),
  JSON.stringify({ messages: [] }),
);
await writeFile(
  join(root, "translations/ko/main.json"),
  JSON.stringify({ translations: [] }),
);
const server = createReviewServer({
  repositoryRoot: root,
  assetRoot: buildDirectory("review"),
  dataRoot: join(root, "data"),
});
try {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  for (const path of [
    "/",
    "/ui",
    "/tools",
    "/app.js",
    "/app.css",
    "/api/settings",
    "/api/tools/options",
    "/api/tasks",
    "/collections",
    "/api/ui/imports",
    "/api/collections",
    "/api/problems",
    "/api/ui",
    "/katex/katex.min.css",
  ]) {
    const response: Response = await fetch(
      `http://127.0.0.1:${address.port}${path}`,
      {
        signal: AbortSignal.timeout(
          path === "/api/ui/imports" ? 60_000 : 20_000,
        ),
      },
    );
    assert.equal(response.status, 200, path);
    await response.arrayBuffer();
  }
  console.log("Review server startup and routes passed");
} finally {
  server.closeAllConnections();
  if (server.listening)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  await rm(root, { recursive: true, force: true });
}

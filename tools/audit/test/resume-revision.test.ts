import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  unlink,
  utimes,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectRemainingOriginals } from "../src/operations/remaining-originals.ts";
import { inputRevision } from "../src/operations/run.ts";
import { recordSourceDownload } from "../src/operations/source-downloads.ts";
import {
  activateSource,
  preserveSource,
} from "../src/operations/source-store.ts";

for (const recorded of [true, false]) {
  test(`resume ignores newer backups with download receipt ${recorded ? "present" : "absent"}`, async () => {
    const root = await mkdtemp(join(tmpdir(), "source-backup-resume-"));
    try {
      const dataRoot = join(root, "data");
      const sourceRoot = join(dataRoot, "problems-source");
      const metadata = { No: 1, ProblemId: 18, Title: "Title" };
      const old = Buffer.from('<div class="block">Old source</div>');
      const next = Buffer.from('<div class="block">New source</div>');
      await mkdir(join(root, "problem-translations/ko/problems"), {
        recursive: true,
      });
      await activateSource(sourceRoot, metadata, old);
      const since = new Date(Date.now() - 1000).toISOString();
      const downloaded = await (
        recorded ? recordSourceDownload : preserveSource
      )(sourceRoot, metadata, next);
      await preserveSource(sourceRoot, metadata, old);
      await utimes(downloaded, new Date(0), new Date(0));
      let calls = 0,
        clock = Date.now();
      const context = {
        repositoryRoot: root,
        dataRoot,
        request: (async (url: string | URL | Request) => {
          calls++;
          assert.equal(
            recorded,
            false,
            "recorded download must survive a newer backup without requests",
          );
          return String(url).endsWith("/html")
            ? new Response(next)
            : Response.json(metadata);
        }) as typeof fetch,
      };
      const options = {
        refreshedSince: since,
        now: () => clock,
        sleep: async (ms: number) => {
          clock += ms;
        },
      };
      assert.equal(
        (await collectRemainingOriginals(context, options)).items[0].status,
        "saved",
      );
      assert.equal(
        await readFile(join(sourceRoot, "1.html"), "utf8"),
        next.toString(),
      );
      assert.equal(
        JSON.parse(await readFile(join(sourceRoot, "downloads/1.json"), "utf8"))
          .state,
        "applied",
      );
      assert.equal(
        (await collectRemainingOriginals(context, options)).items[0].status,
        "skipped",
      );
      assert.equal(calls, recorded ? 0 : 2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

test("bare originals require recorded bytes and cannot be overwritten by an HTTP 200 error", async () => {
  const root = await mkdtemp(join(tmpdir(), "bare-original-"));
  try {
    const dataRoot = join(root, "data");
    const sources = join(dataRoot, "problems-source");
    await mkdir(join(root, "problem-translations/ko/problems"), {
      recursive: true,
    });
    await mkdir(sources, { recursive: true });
    const metadata = { No: 1, ProblemId: 18, Title: "Title" };
    await writeFile(
      join(sources, "index.json"),
      JSON.stringify({ problems: [metadata] }),
    );
    await writeFile(join(sources, "1.html"), "-");
    let response = "-";
    let clock = Date.now();
    const context = {
      repositoryRoot: root,
      dataRoot,
      request: (async (url: string | URL | Request) =>
        String(url).endsWith("/html")
          ? new Response(response)
          : Response.json(metadata)) as typeof fetch,
    };
    const options = {
      refreshedSince: new Date(clock + 60_000).toISOString(),
      now: () => clock,
      sleep: async (ms: number) => {
        clock += ms;
      },
    };
    assert.equal(
      (await collectRemainingOriginals(context, options)).items[0].status,
      "saved",
    );
    response = "Internal server error";
    assert.equal(
      (await collectRemainingOriginals(context, options)).items[0].status,
      "failed",
    );
    assert.equal(await readFile(join(sources, "1.html"), "utf8"), "-");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("problem task revision tracks selected images, including deleted images", async () => {
  const root = await mkdtemp(join(tmpdir(), "revision-images-"));
  try {
    const problems = join(root, "problem-translations/ko/problems");
    const images = join(root, "problem-translations/ko/images/1");
    await mkdir(problems, { recursive: true });
    await mkdir(images, { recursive: true });
    await writeFile(join(problems, "1.html"), "problem");
    const context = { repositoryRoot: root, dataRoot: join(root, "data") };
    const input = { operation: "validate-problems" as const, problems: "1" };
    const before = await inputRevision(context, input);
    const image = join(images, "diagram.svg");
    await writeFile(image, "first");
    const added = await inputRevision(context, input);
    assert.notEqual(added, before);
    await writeFile(image, "second");
    assert.notEqual(await inputRevision(context, input), added);
    await unlink(image);
    assert.equal(await inputRevision(context, input), before);
    await mkdir(join(images, "../2"));
    await writeFile(join(images, "../2/diagram.svg"), "unrelated");
    assert.equal(await inputRevision(context, input), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resume activates a preserved download after interruption without downloading again", async () => {
  const root = await mkdtemp(join(tmpdir(), "source-resume-"));
  try {
    const dataRoot = join(root, "data");
    const sourceRoot = join(dataRoot, "problems-source");
    await mkdir(join(root, "problem-translations/ko/problems"), {
      recursive: true,
    });
    await mkdir(sourceRoot, { recursive: true });
    await writeFile(
      join(sourceRoot, "index.json"),
      JSON.stringify({ problems: [{ No: 1, ProblemId: 18, Title: "Title" }] }),
    );
    await writeFile(
      join(sourceRoot, "1.html"),
      '<div class="block">Old source</div>',
    );
    const controller = new AbortController();
    let clock = Date.now();
    let calls = 0;
    const context = {
      repositoryRoot: root,
      dataRoot,
      signal: controller.signal,
      request: (async (url: string | URL | Request) => {
        calls++;
        if (String(url).endsWith("/html")) {
          const response = new Response('<div class="block">New source</div>');
          const read = response.arrayBuffer.bind(response);
          response.arrayBuffer = async () => {
            const bytes = await read();
            controller.abort(new Error("Interrupted after download"));
            return bytes;
          };
          return response;
        }
        return Response.json({ No: 1, ProblemId: 18, Title: "Title" });
      }) as typeof fetch,
    };
    const options = {
      refreshedSince: new Date(clock - 1000).toISOString(),
      now: () => clock,
      sleep: async (ms: number) => {
        clock += ms;
      },
    };
    await assert.rejects(
      collectRemainingOriginals(context, options),
      /Interrupted/,
    );
    assert.equal(
      JSON.parse(await readFile(join(sourceRoot, "downloads/1.json"), "utf8"))
        .state,
      "downloaded",
    );
    const resumed = { ...context, signal: undefined };
    assert.equal(
      (await collectRemainingOriginals(resumed, options)).items[0].status,
      "saved",
    );
    assert.match(
      await readFile(join(sourceRoot, "1.html"), "utf8"),
      /New source/,
    );
    assert.equal(
      (await collectRemainingOriginals(resumed, options)).items[0].status,
      "skipped",
    );
    assert.equal(calls, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

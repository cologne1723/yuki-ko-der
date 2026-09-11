import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { compileProblemMarkdown } from "translation-core/problem-markdown";
import { readProblemRenderProfileRecord } from "translation-core/problem-render-profile-files";
import { buildProblemTranslations } from "../src/build-problem-translations.ts";
import { collectProblemRenderProfiles } from "../src/operations/problem-render-profiles.ts";
import { setupData } from "../src/operations/setup.ts";
import { pacedDownload } from "../src/operations/paced-download.ts";
import { sourceSamplesFingerprint } from "../src/problem-publication-data.ts";
import { checkProblems } from "../src/operations/problems.ts";
import { activateSource, sha256 } from "../src/operations/source-store.ts";

const stray = fileURLToPath(new URL("../../../data/stray/", import.meta.url));
const source =
  '<div class="block"><div class="sample"><h6>Input</h6><pre>1</pre><h6>Output</h6><pre>2</pre><p>Explanation</p><pre>source trace</pre></div></div>';
const markdown = (no: number) => `---
schemaVersion: 1
locale: ko
problemNo: ${no}
problemId: ${no + 10}
sourceTitle: Original
sourceHtmlSha256: ${sha256(source)}
reviewStatus: approved
title: Fixture
---

## Statement

$x^2$

[related](/problems/no/3)

![diagram](/images/fixture.png)
`;
async function fixture(t: TestContext) {
  await mkdir(stray, { recursive: true });
  const root = await mkdtemp(join(stray, "review-findings-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sourceRoot = join(root, "problem-translations");
  const translations = join(sourceRoot, "ko/problems");
  const outputRoot = join(root, "publication");
  const dataRoot = join(root, "data");
  await mkdir(translations, { recursive: true });
  await mkdir(outputRoot);
  await writeFile(join(outputRoot, "previous.txt"), "preserve me");
  for (const no of [1, 2])
    await writeFile(join(translations, `${no}.mdx`), markdown(no));
  return { root, sourceRoot, translations, outputRoot, dataRoot };
}

test("clean CI collects profiles before strict publication; both engines and original-relative resources work", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    buildProblemTranslations({ ...f, requireRenderProfiles: true }),
    /Render profile unavailable: 1:[\s\S]*Render profile unavailable: 2:/,
  );
  assert.equal(
    await readFile(join(f.outputRoot, "previous.txt"), "utf8"),
    "preserve me",
  );
  let time = 1000;
  const result = await collectProblemRenderProfiles(
    {
      repositoryRoot: f.root,
      dataRoot: f.dataRoot,
      request: async (url) => {
        const no = Number(String(url).split("/").at(-1));
        const script =
          no === 1
            ? "katex@0.17.0/dist/katex.min.js"
            : "mathjax@3/es5/tex-mml-chtml.js";
        return new Response(
          `<!doctype html><title>No.${no} Original - yukicoder</title><script src="https://cdn.jsdelivr.net/npm/${script}"></script><div id="content"><div><div class="block">$x$</div></div></div>`,
          { headers: { "content-type": "text/html" } },
        );
      },
    },
    {
      now: () => time,
      sleep: async (ms) => {
        time += ms;
      },
    },
  );
  assert.deepEqual(
    result.items.map((i) => i.status),
    ["saved", "saved"],
  );
  const entries = await Promise.all(
    [1, 2].map(async (problemNo) => {
      const record = (await readProblemRenderProfileRecord(
        f.dataRoot,
        problemNo,
      ))!;
      return {
        problemNo,
        sourceHtmlSha256: sha256(source),
        sourceSamplesSha256: sha256(JSON.stringify(["1", "2"])),
        pageHtmlSha256: record.pageHtmlSha256,
        profile: record.profile,
      };
    }),
  );
  await writeFile(
    join(f.sourceRoot, "publication-data.json"),
    JSON.stringify({ schemaVersion: 1, entries }),
  );
  // This is the CI path: no local downloaded files and no network requester.
  await buildProblemTranslations({
    ...f,
    dataRoot: join(f.root, "empty-ci-data"),
    requireRenderProfiles: true,
  });
  const catalog = JSON.parse(
    await readFile(join(f.outputRoot, "ko/problem-catalog.json"), "utf8"),
  );
  assert.ok(
    catalog.entries.every(
      (entry: { sourceSamplesSha256?: string }) =>
        entry.sourceSamplesSha256 === entries[0].sourceSamplesSha256,
    ),
  );
  const renderer = await readFile(
    join(f.outputRoot, "assets/problem-page.js"),
    "utf8",
  );
  for (const no of [1, 2]) {
    const dom = new JSDOM(
      await readFile(join(f.outputRoot, `ko/problems/${no}.html`), "utf8"),
      {
        url: `https://example.github.io/project/ko/problems/${no}.html`,
        runScripts: "outside-only",
      },
    );
    try {
      const doc = dom.window.document;
      assert.equal(
        doc.querySelector<HTMLAnchorElement>(".problem-statement a")!.href,
        "https://yukicoder.me/problems/no/3",
      );
      assert.equal(
        doc.querySelector<HTMLImageElement>(".problem-statement img")!.src,
        "https://yukicoder.me/images/fixture.png",
      );
      assert.equal(
        doc.querySelector<HTMLAnchorElement>("nav a")!.href,
        "https://example.github.io/project/",
      );
      dom.window.eval(renderer);
      for (
        let attempt = 0;
        attempt < 100 &&
        !doc.querySelector('[data-math-render-status="ready"]');
        attempt++
      )
        await new Promise((resolve) => setTimeout(resolve, 10));
      assert.ok(doc.querySelector('[data-math-render-status="ready"]'));
      assert.ok(doc.querySelector(no === 1 ? ".katex" : "mjx-container"));
      assert.equal(doc.querySelector(".math-render-error"), null);
    } finally {
      dom.window.close();
    }
  }
});

test("GitHub Actions cannot issue live collector requests", async (t) => {
  const f = await fixture(t);
  const previous = process.env.GITHUB_ACTIONS;
  process.env.GITHUB_ACTIONS = "true";
  try {
    const download = await pacedDownload(
      { repositoryRoot: f.root, dataRoot: f.dataRoot },
      join(f.root, "request-state.json"),
    );
    await assert.rejects(
      download("https://yukicoder.me/problems/no/1"),
      /forbidden in GitHub Actions/,
    );
  } finally {
    if (previous === undefined) delete process.env.GITHUB_ACTIONS;
    else process.env.GITHUB_ACTIONS = previous;
  }
});

test("anonymous wrappers in canonical fragments preserve the exact IO fingerprint", async (t) => {
  const f = await fixture(t);
  const wrapped = `<div><div>${source}</div></div>`;
  await activateSource(
    join(f.dataRoot, "problems-source"),
    { No: 1, ProblemId: 11, Title: "Original" },
    new TextEncoder().encode(wrapped),
  );
  assert.equal(
    await sourceSamplesFingerprint(f.dataRoot, {
      problemNo: 1,
      problemId: 11,
      sourceTitle: "Original",
      sourceHtmlSha256: sha256(wrapped),
    }),
    sha256(JSON.stringify(["1", "2"])),
  );
});

test("all incompatible HTML errors are reported before existing publication is touched", async (t) => {
  const f = await fixture(t);
  for (const no of [1, 2]) {
    await writeFile(
      join(f.translations, `${no}.html`),
      compileProblemMarkdown(markdown(no)).replace(
        'data-render-markup-version="2"',
        'data-render-markup-version="1"',
      ),
    );
    await rm(join(f.translations, `${no}.mdx`));
  }
  await assert.rejects(
    buildProblemTranslations(f),
    /1: Error: Unsupported problem render markup version: 1[\s\S]*2: Error: Unsupported problem render markup version: 1/,
  );
  assert.equal(
    await readFile(join(f.outputRoot, "previous.txt"), "utf8"),
    "preserve me",
  );
});

test("setup honors Retry-After and persisted cooldown across invocations", async (t) => {
  const f = await fixture(t);
  let time = 1000;
  const times: number[] = [];
  const options = {
    now: () => time,
    sleep: async (ms: number) => {
      time += ms;
    },
  };
  const context = {
    repositoryRoot: f.root,
    dataRoot: f.dataRoot,
    problems: [1],
    refresh: true,
    request: async () => {
      times.push(time);
      return new Response("", {
        status: 429,
        headers: { "Retry-After": "60" },
      });
    },
  };
  assert.equal(
    (await setupData(context, "problems", options)).items[0].status,
    "failed",
  );
  assert.deepEqual(times, [1000, 61000, 121000]);
  await setupData(context, "problems", { ...options, attempts: 1 });
  assert.equal(times[3], 181000);
});

test("setup excludes concurrent setup/profile collectors before they issue requests", async (t) => {
  const f = await fixture(t);
  const arrived = Promise.withResolvers<void>();
  const response = Promise.withResolvers<Response>();
  const context = {
    repositoryRoot: f.root,
    dataRoot: f.dataRoot,
    problems: [1],
  };
  const first = setupData(
    {
      ...context,
      request: async () => {
        arrived.resolve();
        return response.promise;
      },
    },
    "problems",
    { attempts: 1 },
  );
  await arrived.promise;
  try {
    const competing = {
      ...context,
      request: async () => {
        throw new Error("A competing collector issued a request");
      },
    };
    await assert.rejects(
      setupData(competing, "problems"),
      /Another ground-truth collector/,
    );
    await assert.rejects(
      collectProblemRenderProfiles(competing),
      /Another ground-truth collector/,
    );
  } finally {
    response.resolve(new Response("", { status: 404 }));
    await first;
  }
});

test("saved audit ignores worked prose but still detects modified raw IO", async (t) => {
  const f = await fixture(t);
  const metadata = { No: 1, ProblemId: 11, Title: "Original" };
  await activateSource(
    join(f.dataRoot, "problems-source"),
    metadata,
    new TextEncoder().encode(source),
  );
  const dom = new JSDOM(compileProblemMarkdown(markdown(1)));
  try {
    dom.window.document.querySelector(".problem-statement")!.innerHTML =
      source.replace("source trace", "translated trace");
    await rm(join(f.translations, "1.mdx"));
    const path = join(f.translations, "1.html");
    await writeFile(path, dom.serialize());
    const context = {
      repositoryRoot: f.root,
      dataRoot: f.dataRoot,
      problems: [1],
    };
    assert.equal(
      (await checkProblems(context, "audit")).items[0].status,
      "passed",
    );
    dom.window.document.querySelector("pre")!.textContent = "changed input";
    await writeFile(path, dom.serialize());
    assert.equal(
      (await checkProblems(context, "audit")).items[0].status,
      "review-required",
    );
  } finally {
    dom.window.close();
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { build } from "esbuild";
import { parseProblemCatalog } from "translation-core/problem-catalog";
import {
  readProblemRenderProfile,
  readProblemRenderProfileRecord,
  writeProblemRenderProfile,
} from "translation-core/problem-render-profile-files";
import {
  collectProblemRenderProfiles,
  retryAfterMilliseconds,
} from "../src/operations/problem-render-profiles.ts";
import { activateSource, sha256 } from "../src/operations/source-store.ts";
import { sourceSamplesFingerprint } from "../src/problem-publication-data.ts";
import { labelPublishedProblem } from "../src/problem-publication.ts";
import { collectRemainingOriginals } from "../src/operations/remaining-originals.ts";

const script = {
  mathjax: "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js",
  katex: "https://cdn.jsdelivr.net/npm/katex@0.17.0/dist/katex.min.js",
};
const page = (engine: keyof typeof script, problemNo = 1) =>
  `<!doctype html><html><head><title>No.${problemNo} Original - yukicoder</title><meta property="og:url" content="https://yukicoder.me/problems/no/${problemNo}"><script src="${script[engine]}"></script></head><body><div id="content"><div class="block"><p>$x$</p></div></div></body></html>`;
const source =
  '<div class="block"><div class="sample"><h5>任意</h5><h6>入力</h6><pre>1 \n2\n</pre><h6>出力</h6><pre>3</pre><p>説明</p><pre>excluded explanation</pre></div></div>';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "render-profiles-"));
  const dataRoot = join(root, "data");
  const translations = join(root, "problem-translations/ko/problems");
  await mkdir(translations, { recursive: true });
  for (const no of [1, 2]) {
    await writeFile(
      join(translations, `${no}.mdx`),
      `---\nschemaVersion: 1\nlocale: ko\nproblemNo: ${no}\nproblemId: ${no + 10}\nsourceTitle: Original\nsourceHtmlSha256: ${sha256(source)}\nreviewStatus: approved\ntitle: 제목\n---\n\n## 문제\n\n번역\n`,
    );
  }
  return {
    root,
    dataRoot,
    translations,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

test("full-page scripts determine profiles irrespective of problem number; saved evidence is verified", async () => {
  const f = await fixture();
  try {
    assert.equal(await readProblemRenderProfile(f.dataRoot, 204), undefined);
    for (const [no, engine] of [
      [204, "mathjax"],
      [2025, "katex"],
      [2069, "katex"],
      [2906, "katex"],
    ] as const) {
      const record = await writeProblemRenderProfile(
        f.dataRoot,
        no,
        page(engine, no),
      );
      assert.deepEqual(await readProblemRenderProfile(f.dataRoot, no), {
        engine,
        version: engine === "mathjax" ? "3.2.2" : "0.17.0",
      });
      assert.equal(record.pageHtmlSha256, sha256(page(engine, no)));
    }
    await writeProblemRenderProfile(f.dataRoot, 204, page("katex", 204));
    assert.equal(
      (await readProblemRenderProfile(f.dataRoot, 204))?.engine,
      "katex",
    );
    const record = (await readProblemRenderProfileRecord(f.dataRoot, 204))!;
    await writeFile(
      join(
        f.dataRoot,
        "problem-render-profiles/pages",
        `${record.pageHtmlSha256}.html`,
      ),
      "tampered",
    );
    await assert.rejects(
      readProblemRenderProfile(f.dataRoot, 204),
      /hash mismatch/,
    );
  } finally {
    await f.cleanup();
  }
});

test("API fragments, meta-only declarations, and conflicting script engines cannot create profiles", async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      writeProblemRenderProfile(f.dataRoot, 1, source),
      /statement is missing/,
    );
    await assert.rejects(
      writeProblemRenderProfile(
        f.dataRoot,
        1,
        page("katex").replace(
          `<script src="${script.katex}"></script>`,
          '<meta name="yukicoder-ko-math-engine" content="katex"><meta name="yukicoder-ko-math-version" content="0.17.0">',
        ),
      ),
      /absent or ambiguous/,
    );
    await assert.rejects(
      writeProblemRenderProfile(
        f.dataRoot,
        1,
        page("katex").replace(
          "</head>",
          `<script src="${script.mathjax}"></script></head>`,
        ),
      ),
      /absent or ambiguous/,
    );
    assert.equal(await readProblemRenderProfile(f.dataRoot, 1), undefined);
  } finally {
    await f.cleanup();
  }
});

test("wrong public problem responses and conflicting identity markers cannot replace saved profile evidence", async () => {
  const f = await fixture();
  try {
    await writeProblemRenderProfile(f.dataRoot, 1, page("katex", 1));
    const path = join(f.dataRoot, "problem-render-profiles/1.json");
    const before = await readFile(path, "utf8");
    for (const html of [
      page("katex", 2).replace(
        '<div id="content">',
        '<div id="content"><h3>No.1 forged heading</h3>',
      ),
      page("katex", 1).replace("No.1 Original", "No.11 Original"),
      page("katex", 1).replace(/<title>.*?<\/title>/u, ""),
      page("katex", 1).replace("/no/1", "/no/2"),
      page("katex", 1).replace(
        "</head>",
        '<link rel="canonical" href="https://yukicoder.me/problems/no/2"></head>',
      ),
      page("katex", 1).replace(
        "</body>",
        '<span id="contest-problem-selector-wrapper" data-current-problem-no="2"></span></body>',
      ),
    ]) {
      await assert.rejects(
        writeProblemRenderProfile(f.dataRoot, 1, html),
        /identity/,
      );
      assert.equal(await readFile(path, "utf8"), before);
    }
    let time = Date.now();
    const result = await collectProblemRenderProfiles(
      {
        repositoryRoot: f.root,
        dataRoot: f.dataRoot,
        problems: [2],
        request: async () =>
          new Response(page("katex", 1), {
            status: 200,
            headers: { "Content-Type": "text/html" },
          }),
      },
      {
        intervalMs: 1000,
        now: () => time,
        sleep: async (ms: number) => {
          time += ms;
        },
      },
    );
    assert.equal(result.items[0].status, "failed");
    assert.match(result.items[0].message, /identity mismatch/);
    assert.equal(await readProblemRenderProfile(f.dataRoot, 2), undefined);
    const other = await writeProblemRenderProfile(
      f.dataRoot,
      2,
      page("katex", 2),
    );
    await writeFile(
      path,
      JSON.stringify({
        ...JSON.parse(before),
        pageHtmlSha256: other.pageHtmlSha256,
      }),
    );
    await assert.rejects(
      readProblemRenderProfile(f.dataRoot, 1),
      /identity mismatch/,
    );
  } finally {
    await f.cleanup();
  }
});

test("collection is paced and sequential, honors Retry-After, and resumes without fetching saved profiles", async () => {
  const f = await fixture();
  try {
    let time = Date.UTC(2026, 8, 10),
      count = 0,
      active = 0;
    const started: number[] = [];
    const originals = await Promise.all(
      [1, 2].map((no) => readFile(join(f.translations, `${no}.mdx`), "utf8")),
    );
    const request: typeof fetch = async (url) => {
      assert.equal(active++, 0);
      started.push(time);
      await Promise.resolve();
      active--;
      if (++count === 1)
        return new Response("slow down", {
          status: 429,
          headers: { "Retry-After": "7" },
        });
      return new Response(
        page(
          count === 2 ? "mathjax" : "katex",
          Number(String(url).split("/").at(-1)),
        ),
        {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        },
      );
    };
    const context = { repositoryRoot: f.root, dataRoot: f.dataRoot, request };
    const options = {
      intervalMs: 1000,
      now: () => time,
      sleep: async (ms: number) => {
        time += ms;
      },
    };
    const result = await collectProblemRenderProfiles(context, options);
    assert.deepEqual(
      result.items.map((item) => item.status),
      ["saved", "saved"],
    );
    assert.deepEqual(
      started.map((t) => t - started[0]),
      [0, 7000, 8000],
    );
    assert.deepEqual(
      (await collectProblemRenderProfiles(context, options)).items.map(
        (item) => item.status,
      ),
      ["skipped", "skipped"],
    );
    assert.equal(count, 3);
    assert.deepEqual(
      await Promise.all(
        [1, 2].map((no) => readFile(join(f.translations, `${no}.mdx`), "utf8")),
      ),
      originals,
    );
  } finally {
    await f.cleanup();
  }
});

test("exhausted retries retain cooldown across runs; permanent errors are not retried", async () => {
  const f = await fixture();
  try {
    let time = Date.UTC(2026, 8, 10),
      count = 0;
    const options = {
      intervalMs: 1000,
      attempts: 1,
      now: () => time,
      sleep: async (ms: number) => {
        time += ms;
      },
    };
    const context = {
      repositoryRoot: f.root,
      dataRoot: f.dataRoot,
      problems: [1],
    };
    const first = await collectProblemRenderProfiles(
      {
        ...context,
        request: async () =>
          new Response("busy", {
            status: 503,
            headers: { "Retry-After": new Date(time + 20000).toUTCString() },
          }),
      },
      options,
    );
    assert.equal(first.items[0].status, "failed");
    const start = time;
    const second = await collectProblemRenderProfiles(
      {
        ...context,
        request: async () => {
          count++;
          assert.ok(time - start >= 20000);
          return new Response("absent", { status: 404 });
        },
      },
      { ...options, attempts: 5 },
    );
    assert.equal(second.items[0].status, "failed");
    assert.equal(count, 1);
    assert.equal(retryAfterMilliseconds("invalid", time), 0);
  } finally {
    await f.cleanup();
  }
});

test("sample fingerprint uses only the original revision recorded by the translation", async () => {
  const f = await fixture();
  try {
    const metadata = { No: 1, ProblemId: 11, Title: "Original" };
    const expected = {
      problemNo: 1,
      problemId: 11,
      sourceTitle: "Original",
      sourceHtmlSha256: sha256(source),
    };
    assert.equal(
      await sourceSamplesFingerprint(f.dataRoot, expected),
      undefined,
    );
    await activateSource(
      join(f.dataRoot, "problems-source"),
      metadata,
      Buffer.from(source),
    );
    const digest = sha256(JSON.stringify(["1 \n2", "3"]));
    assert.equal(await sourceSamplesFingerprint(f.dataRoot, expected), digest);
    await activateSource(
      join(f.dataRoot, "problems-source"),
      metadata,
      Buffer.from(source.replace("1 ", "99 ")),
    );
    assert.equal(await sourceSamplesFingerprint(f.dataRoot, expected), digest);
    assert.equal(
      await sourceSamplesFingerprint(f.dataRoot, {
        ...expected,
        sourceHtmlSha256: "0".repeat(64),
      }),
      undefined,
    );
    assert.equal(
      await sourceSamplesFingerprint(f.dataRoot, {
        ...expected,
        problemId: 99,
      }),
      undefined,
    );
    assert.equal(
      await readFile(join(f.dataRoot, "problems-source/1.html"), "utf8"),
      source.replace("1 ", "99 "),
    );
  } finally {
    await f.cleanup();
  }
});

test("remaining-original chain covers newly added translations and untranslated corpus, with verified revision resume", async () => {
  const f = await fixture();
  try {
    const root = join(f.dataRoot, "problems-source");
    const refreshedSince = new Date(Date.now() - 1000).toISOString();
    await activateSource(
      root,
      { No: 1, ProblemId: 11, Title: "Original" },
      Buffer.from(source),
    );
    await activateSource(
      root,
      { No: 3, ProblemId: 13, Title: "Original" },
      Buffer.from(source),
    );
    for (const file of await readdir(join(root, "revisions/3")))
      await utimes(join(root, "revisions/3", file), new Date(0), new Date(0));
    let time = Date.now();
    const urls: string[] = [];
    const request: typeof fetch = async (url) => {
      urls.push(String(url));
      const id = Number(String(url).match(/problems\/(\d+)/u)![1]);
      assert.ok(
        id === 12 || id === 13,
        "already refreshed No.1 must not be fetched again",
      );
      return String(url).endsWith("/html")
        ? new Response(source)
        : Response.json({ No: id - 10, ProblemId: id, Title: "Original" });
    };
    const context = { repositoryRoot: f.root, dataRoot: f.dataRoot, request };
    const options = {
      refreshedSince,
      intervalMs: 1000,
      now: () => time,
      sleep: async (ms: number) => {
        time += ms;
      },
    };
    const result = await collectRemainingOriginals(context, options);
    assert.deepEqual(
      result.items.map((item) => [item.id, item.status]),
      [
        ["1", "skipped"],
        ["2", "saved"],
        ["3", "saved"],
      ],
    );
    assert.equal(urls.length, 4);
    assert.equal(await readFile(join(root, "2.html"), "utf8"), source);
    assert.ok(
      (await readFile(join(f.translations, "2.mdx"), "utf8")).includes(
        "reviewStatus: approved",
      ),
    );
    assert.ok(
      (await collectRemainingOriginals(context, options)).items.every(
        (item) => item.status === "skipped",
      ),
    );
    assert.equal(urls.length, 4);
    const profiles = await collectProblemRenderProfiles(
      {
        ...context,
        request: async (url) =>
          new Response(page("katex", Number(String(url).split("/").at(-1))), {
            headers: { "Content-Type": "text/html" },
          }),
      },
      { ...options, fullCorpus: true },
    );
    assert.deepEqual(
      profiles.items.map((item) => item.id),
      ["1", "2", "3"],
    );
    assert.ok(profiles.items.every((item) => item.status === "saved"));
  } finally {
    await f.cleanup();
  }
});

test("cancellation preserves completed profiles and collection locks prevent overlapping requests", async () => {
  const f = await fixture();
  try {
    let time = Date.now(),
      requests = 0;
    const controller = new AbortController();
    const options = {
      intervalMs: 1000,
      now: () => time,
      sleep: async (ms: number) => {
        time += ms;
      },
    };
    const context = { repositoryRoot: f.root, dataRoot: f.dataRoot };
    const request: typeof fetch = async (url) => {
      requests++;
      await assert.rejects(
        collectProblemRenderProfiles(
          {
            ...context,
            request: async () => {
              throw new Error("must not run");
            },
          },
          options,
        ),
        /Another ground-truth collector/,
      );
      return new Response(
        page("katex", Number(String(url).split("/").at(-1))),
        {
          headers: { "Content-Type": "text/html" },
        },
      );
    };
    await assert.rejects(
      collectProblemRenderProfiles(
        {
          ...context,
          request,
          signal: controller.signal,
          progress: () => controller.abort(),
        },
        options,
      ),
    );
    assert.equal(requests, 1);
    assert.ok(await readProblemRenderProfile(f.dataRoot, 1));
    assert.equal(await readProblemRenderProfile(f.dataRoot, 2), undefined);
    const resumed = await collectProblemRenderProfiles(
      { ...context, request },
      options,
    );
    assert.deepEqual(
      resumed.items.map((item) => item.status),
      ["skipped", "saved"],
    );
    assert.equal(requests, 2);
  } finally {
    await f.cleanup();
  }
});

test("catalog accepts optional sample digests and rejects malformed values", () => {
  const entry = {
    problemNo: 1,
    problemId: 11,
    source: "Original",
    target: "번역",
    htmlSha256: "a".repeat(64),
  };
  const catalog = {
    schemaVersion: 1,
    revision: "b".repeat(64),
    entries: [entry],
  };
  assert.equal(
    parseProblemCatalog(catalog).entries[0].sourceSamplesSha256,
    undefined,
  );
  assert.equal(
    parseProblemCatalog({
      ...catalog,
      entries: [{ ...entry, sourceSamplesSha256: "c".repeat(64) }],
    }).entries[0].sourceSamplesSha256,
    "c".repeat(64),
  );
  assert.throws(() =>
    parseProblemCatalog({
      ...catalog,
      entries: [{ ...entry, sourceSamplesSha256: "invalid" }],
    }),
  );
});

test("published metadata preserves translation hashes/approvals; async renderer receives profile and hosted fonts", async () => {
  const original = `<html><head></head><body><main data-yukicoder-ko-problem data-review-status="approved" data-source-html-sha256="${"a".repeat(64)}"><h3>No.204 제목 $t$</h3><div class="problem-statement"><div class="block">$x$</div></div></main></body></html>`;
  const html = labelPublishedProblem(original, {
    profile: { engine: "mathjax", version: "3.2.2" },
    sourceUrl: "https://yukicoder.me/problems/no/204",
  });
  const unavailable = new JSDOM(
    labelPublishedProblem(original, {
      sourceUrl: "https://yukicoder.me/problems/no/204",
    }),
  );
  try {
    assert.ok(unavailable.window.document.querySelector(".math-render-error"));
    assert.equal(
      unavailable.window.document.querySelector(
        'meta[name="yukicoder-ko-math-engine"]',
      ),
      null,
    );
    assert.equal(
      unavailable.window.document.querySelector(".problem-statement")
        ?.innerHTML,
      '<div class="block">$x$</div>',
    );
    assert.equal(
      unavailable.window.document
        .querySelector("main")
        ?.getAttribute("data-review-status"),
      "approved",
    );
  } finally {
    unavailable.window.close();
  }
  const bundle = (
    await build({
      entryPoints: [
        fileURLToPath(new URL("../src/published-page.ts", import.meta.url)),
      ],
      bundle: true,
      write: false,
      platform: "browser",
      plugins: [
        {
          name: "capture-renderer",
          setup(builder) {
            builder.onResolve(
              { filter: /^translation-core\/problem-math$/ },
              () => ({ path: "render", namespace: "test" }),
            );
            builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({
              contents:
                "export async function renderProblemMath(root, profile, options) { await Promise.resolve(); window.rendered = {profile, options, title: root.querySelector('h3')?.textContent}; }",
              loader: "js",
            }));
          },
        },
      ],
    })
  ).outputFiles[0].text;
  for (const missing of [false, true]) {
    const dom = new JSDOM(html, {
      url: "https://translations.example/repo/ko/problems/204.html",
      runScripts: "outside-only",
    });
    try {
      const document = dom.window.document;
      assert.equal(
        document.querySelector("main")?.getAttribute("data-source-html-sha256"),
        "a".repeat(64),
      );
      assert.equal(
        document.querySelector("main")?.getAttribute("data-review-status"),
        "approved",
      );
      assert.equal(
        document
          .querySelector('meta[name="yukicoder-ko-source-url"]')
          ?.getAttribute("content"),
        "https://yukicoder.me/problems/no/204",
      );
      if (missing)
        document
          .querySelector('meta[name="yukicoder-ko-math-version"]')
          ?.remove();
      dom.window.console.error = () => {};
      dom.window.eval(bundle);
      await new Promise((done) => setTimeout(done, 0));
      assert.equal(
        document
          .querySelector(".problem-statement")
          ?.getAttribute("data-math-render-status"),
        missing ? "error" : "ready",
      );
      if (missing) assert.ok(document.querySelector('[role="alert"]'));
      else {
        const rendered = JSON.parse(
          JSON.stringify(
            (dom.window as unknown as { rendered: unknown }).rendered,
          ),
        );
        assert.deepEqual(rendered, {
          title: "No.204 제목 $t$",
          profile: { engine: "mathjax", version: "3.2.2" },
          options: {
            fontUrl:
              "https://translations.example/repo/assets/mathjax/fonts/woff-v2",
          },
        });
      }
    } finally {
      dom.window.close();
    }
  }
});

test("published title and statement formulas share macro scope while navigation remains literal", async () => {
  const bundle = (
    await build({
      entryPoints: [
        fileURLToPath(new URL("../src/published-page.ts", import.meta.url)),
      ],
      bundle: true,
      write: false,
      platform: "browser",
    })
  ).outputFiles[0].text;
  for (const profile of [
    { engine: "mathjax", version: "3.2.2" },
    { engine: "katex", version: "0.17.0" },
  ] as const) {
    const definition =
      profile.engine === "mathjax"
        ? String.raw`\newcommand{\fromtitle}{T}`
        : String.raw`\gdef\fromtitle{T}`;
    const source = String.raw`<!doctype html><html><head></head><body><nav>$outside$</nav><main data-yukicoder-ko-problem data-review-status="approved"><h3>No.1 $${definition}\fromtitle$</h3><div class="problem-statement"><div class="block">$\fromtitle+1$</div></div></main></body></html>`;
    const dom = new JSDOM(
      labelPublishedProblem(source, {
        profile,
        sourceUrl: "https://yukicoder.me/problems/no/1",
      }),
      {
        url: "https://translations.example/ko/problems/1.html",
        runScripts: "outside-only",
      },
    );
    try {
      const document = dom.window.document;
      const errors: unknown[] = [];
      dom.window.console.error = (error: unknown) => errors.push(error);
      dom.window.eval(bundle);
      const statement =
        document.querySelector<HTMLElement>(".problem-statement")!;
      const deadline = Date.now() + 10000;
      while (!statement.dataset.mathRenderStatus && Date.now() < deadline)
        await new Promise((done) => setTimeout(done, 10));
      assert.equal(
        statement.dataset.mathRenderStatus,
        "ready",
        `${profile.engine}: ${errors.map(String).join("; ")}`,
      );
      const formula = profile.engine === "mathjax" ? "mjx-container" : ".katex";
      assert.equal(
        document.querySelectorAll(`h3 ${formula}`).length,
        1,
        `${profile.engine} title formula`,
      );
      assert.equal(
        statement.querySelectorAll(formula).length,
        1,
        `${profile.engine} statement formula`,
      );
      assert.equal(
        document.querySelectorAll(".katex-error, mjx-merror, [data-mjx-error]")
          .length,
        0,
      );
      if (profile.engine === "mathjax")
        assert.ok(
          statement.querySelector("mjx-c.mjx-c1D447"),
          "statement uses the title's T macro",
        );
      else
        assert.ok(
          statement.querySelector(".katex-html")?.textContent?.includes("T"),
          "statement uses the title's T macro",
        );
      assert.equal(document.querySelector("nav")?.innerHTML, "$outside$");
      assert.equal(document.querySelectorAll(".math-render-error").length, 0);
      assert.deepEqual(errors, []);
    } finally {
      dom.window.close();
    }
  }
});

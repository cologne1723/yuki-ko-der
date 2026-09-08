import { createTranslationCache } from "../translation-cache.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import type { createProblemEngine } from "../problem-engine.ts";
import { page } from "./extension-fixture.ts";

const code = (
  await build({
    stdin: {
      contents:
        'import {createProblemEngine} from "./src/problem-engine.ts"; globalThis.engine = createProblemEngine(globalThis);',
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: "iife",
  })
).outputFiles[0].text;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const source =
  '<div class="block"><h4>説明</h4><p>$N$</p><div class="sample"><h5>例</h5><pre>1  2\n</pre><pre>3\n</pre></div></div>';
const translated = (samples = "1  2\n") =>
  `<!doctype html><main data-yukicoder-ko-problem data-schema-version="1" data-locale="ko" data-problem-no="1" data-problem-id="18" data-source-title="題名" data-source-html-sha256="${hash(source)}"><h3>No.1 번역 제목</h3><div class="problem-statement"><div class="block"><h4>설명</h4><p>$M^2$</p><div class="sample"><h5>예제</h5><pre>${samples}</pre><pre>3\n</pre></div></div></div></main>`;
function fixture() {
  const state = {
    body: translated(),
    bodyStatus: 200,
    canonical: source,
    offline: false,
  };
  const { dom, close } = page(
    `<body><main id="content" data-problem-id="18"><h3>No.1 題名</h3>${source}</main></body>`,
  );
  const saved: Record<string, unknown> = {};
  const calls: string[] = [];
  const cache = createTranslationCache({
    get: async (key) => (key === null ? { ...saved } : { [key]: saved[key] }),
    set: async (values) => {
      Object.assign(saved, values);
    },
    remove: async (keys) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete saved[key];
    },
  });
  Object.assign(dom.window, {
    YUKICODER_KO_CONFIG: {
      problemTranslationBaseUrl: "https://translations.test/",
    },
    chrome: {
      runtime: {
        sendMessage: async (request: {
          type: string;
          problemNo: number;
          html?: string;
        }) => {
          const key = `problem-translation-html:ko:${request.problemNo}`;
          if (request.type === "problem-cache:get")
            return { ok: true, value: (await cache.get(key))[key] };
          if (request.type === "problem-cache:set")
            await cache.set({ [key]: request.html });
          if (request.type === "problem-cache:remove") await cache.remove(key);
          return { ok: true };
        },
      },
      storage: {
        local: {
          get: async (key: string) => ({ [key]: saved[key] }),
          set: async (value: Record<string, unknown>) => {
            Object.assign(saved, value);
          },
          remove: async (key: string) => {
            delete saved[key];
          },
        },
      },
    },
    fetch: async (url: string | URL) => {
      const path = String(url);
      calls.push(path);
      if (state.offline) throw new Error("offline");
      if (path.startsWith("https://translations.test/"))
        return new Response(state.body, { status: state.bodyStatus });
      if (path.endsWith("/html")) return new Response(state.canonical);
      return Response.json({ No: 1, ProblemId: 18, Title: "題名" });
    },
  });
  dom.window.eval(code);
  const engine = (
    dom.window as unknown as { engine: ReturnType<typeof createProblemEngine> }
  ).engine;
  const catalog = () => ({
    schemaVersion: 1 as const,
    revision: hash(state.body),
    entries: [
      {
        problemNo: 1,
        problemId: 18,
        source: "題名",
        target: "번역 제목",
        htmlSha256: hash(state.body),
      },
    ],
  });
  return { dom, close, state, engine, saved, calls, catalog };
}

test("problem replacement preserves exact sample copying, independent formulas and original node restoration", async () => {
  const f = fixture();
  try {
    const doc = f.dom.window.document;
    const original = doc.querySelector(".block")!;
    const copy = doc.createElement("button");
    copy.className = "copy-sample-input";
    let copied = "";
    copy.onclick = () => {
      copied = copy.closest(".sample")!.querySelector("pre")!.textContent!;
    };
    original.querySelector(".sample")!.append(copy);
    assert.equal(
      (await f.engine.translateProblem(() => true, f.catalog())).status,
      "applied",
    );
    copy.click();
    assert.equal(copied, "1  2\n");
    assert.ok(doc.querySelector(".katex"));
    assert.equal(original.isConnected, false);
    f.engine.restoreProblem();
    assert.equal(doc.querySelector(".block"), original);
    assert.equal(original.querySelector("button"), copy);
    assert.equal(doc.querySelector("h3")!.textContent, "No.1 題名");
  } finally {
    f.close();
  }
});

test("standalone source samples participate in validation, replacement and restoration", async () => {
  const f = fixture();
  try {
    const doc = f.dom.window.document;
    const extra =
      '<div class="sample"><h5>追加</h5><pre>4\n</pre><pre>5\n</pre></div>';
    f.state.canonical += extra;
    doc.querySelector("#content")!.insertAdjacentHTML("beforeend", extra);
    const original = doc.querySelector("#content > .sample")!;
    f.state.body = f.state.body.replace(hash(source), hash(f.state.canonical));
    const rejected = await f.engine.translateProblem(() => true, f.catalog());
    assert.equal(rejected.status, "failed");
    assert.ok(original.isConnected);
    f.state.body = f.state.body.replace(
      "</div></div></div></main>",
      `</div>${extra}</div></div></main>`,
    );
    assert.equal(
      (await f.engine.translateProblem(() => true, f.catalog())).status,
      "applied",
    );
    assert.equal(original.isConnected, false);
    assert.equal(doc.querySelectorAll(".sample pre").length, 4);
    f.engine.restoreProblem();
    assert.equal(doc.querySelector("#content > .sample"), original);
  } finally {
    f.close();
  }
});

test("sample and source mismatches reject cleanly without changing the Japanese page", async () => {
  for (const kind of ["sample", "source", "catalog", "controls"]) {
    const f = fixture();
    try {
      const catalog = f.catalog();
      if (kind === "sample") {
        f.state.body = translated("1 2\n");
        catalog.entries[0].htmlSha256 = hash(f.state.body);
      }
      if (kind === "source") f.state.canonical = source.replace("$N$", "$Z$");
      if (kind === "catalog") catalog.entries[0].htmlSha256 = "a".repeat(64);
      if (kind === "controls") {
        const button = f.dom.window.document.createElement("button");
        button.className = "copy-sample-input";
        f.dom.window.document.querySelector(".block")!.append(button);
      }
      const before = f.dom.window.document.body.innerHTML;
      const result = await f.engine.translateProblem(() => true, catalog);
      assert.equal(result.status, "failed", kind);
      assert.equal(
        result.status === "failed" && result.reason,
        "verification",
        kind,
      );
      f.engine.restoreProblem();
      assert.equal(f.dom.window.document.body.innerHTML, before, kind);
    } finally {
      f.close();
    }
  }
});

test("an exception during DOM replacement rolls back already-detached originals", async () => {
  const f = fixture();
  try {
    const original = f.dom.window.document.querySelector(".block");
    const before = f.dom.window.document.body.innerHTML;
    f.dom.window.Comment.prototype.before = () => {
      throw new Error("DOM failure");
    };
    assert.equal(
      (await f.engine.translateProblem(() => true, f.catalog())).status,
      "failed",
    );
    assert.equal(f.dom.window.document.body.innerHTML, before);
    assert.equal(f.dom.window.document.querySelector(".block"), original);
  } finally {
    f.close();
  }
});

test("authoritative removals invalidate caches and network failure cannot resurrect removed bodies", async () => {
  for (const kind of ["404", "410", "catalog"]) {
    const f = fixture();
    try {
      await f.engine.translateProblem(() => true, f.catalog());
      f.engine.restoreProblem();
      assert.ok(f.saved["problem-translation-html:ko:1"]);
      const catalog = f.catalog();
      if (kind === "catalog") catalog.entries = [];
      else f.state.bodyStatus = Number(kind);
      assert.equal(
        (await f.engine.translateProblem(() => true, catalog)).status,
        "unavailable",
      );
      assert.equal(f.saved["problem-translation-html:ko:1"], undefined);
      f.state.offline = true;
      const result = await f.engine.translateProblem(() => true, catalog);
      assert.equal(
        result.status,
        kind === "catalog" ? "unavailable" : "failed",
      );
      assert.equal(
        f.dom.window.document.querySelector("h3")!.textContent,
        "No.1 題名",
      );
    } finally {
      f.close();
    }
  }
});

test("late translation completion cannot apply after disabling and cached bodies still require live source verification", async () => {
  const f = fixture();
  try {
    assert.equal(
      (await f.engine.translateProblem(() => false, f.catalog())).status,
      "cancelled",
    );
    assert.equal(
      f.dom.window.document.querySelector("h3")!.textContent,
      "No.1 題名",
    );
    f.state.offline = true;
    const result = await f.engine.translateProblem(() => true, f.catalog());
    assert.equal(result.status === "failed" && result.reason, "network");
  } finally {
    f.close();
  }
});

import { createTranslationCache } from "../translation-cache.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { sampleDataValues } from "translation-core/problem-samples";
import { sourceStatementBlocks } from "translation-core/problem-document";
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
function fixture(options: { samples?: boolean } = {}) {
  const state = {
    body: translated(),
    bodyStatus: 200,
    canonical: source,
    offline: false,
  };
  if (options.samples === false) {
    state.canonical = source.replace(/<div class="sample">.*?<\/div>/su, "");
    state.body = state.body
      .replace(/<div class="sample">.*?<\/div>/su, "")
      .replace(hash(source), hash(state.canonical));
  }
  const { dom, close } = page(
    `<head><script src="https://cdn.jsdelivr.net/npm/katex@0.17.0/dist/katex.min.js"></script></head><body><main id="content" data-problem-id="18"><h3>No.1 題名</h3>${state.canonical}</main></body>`,
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
      assert.match(
        path,
        /^https:\/\/yukicoder\.me\/api\/v1\/problems\/18(?:\/html)?$/,
      );
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
        sourceSamplesSha256: hash(
          JSON.stringify(
            sampleDataValues(
              sourceStatementBlocks(engine.parseHtml(state.canonical).body),
            ),
          ),
        ),
      },
    ],
  });
  return { dom, close, state, engine, saved, calls, catalog };
}

test("explicit incompatible markup is rejected even with a matching remote or cached catalog digest", async () => {
  for (const offline of [false, true]) {
    const f = fixture();
    try {
      f.state.body = f.state.body.replace(
        "data-yukicoder-ko-problem",
        'data-yukicoder-ko-problem data-render-markup-version="1"',
      );
      if (offline) f.saved["problem-translation-html:ko:1"] = f.state.body;
      f.state.offline = offline;
      const original = f.dom.window.document.body.innerHTML;
      const result = await f.engine.translateProblem(() => true, f.catalog());
      assert.equal(result.status, "failed");
      assert.equal(f.dom.window.document.body.innerHTML, original);
    } finally {
      f.close();
    }
  }
});

test("version 2 loads remotely and from matching cache without rewriting explicit CODE", async () => {
  const f = fixture();
  try {
    f.state.body = f.state.body
      .replace(
        "data-yukicoder-ko-problem",
        'data-yukicoder-ko-problem data-render-markup-version="2"',
      )
      .replace("<p>$M^2$</p>", "<p>$M^2$</p><pre><code>$literal$</code></pre>");
    for (const offline of [false, true]) {
      f.state.offline = offline;
      const result = await f.engine.translateProblem(() => true, f.catalog(), {
        refresh: true,
      });
      assert.equal(result.status, "applied");
      assert.equal(
        f.dom.window.document.querySelector("pre > code")?.textContent,
        "$literal$",
      );
      f.engine.restoreProblem();
    }
  } finally {
    f.close();
  }
});

test("problem replacement preserves exact sample copying, independent formulas and original node restoration", async () => {
  const f = fixture();
  try {
    f.state.body = f.state.body.replace(
      "data-yukicoder-ko-problem",
      'data-yukicoder-ko-problem data-review-status="unreviewed"',
    );
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
    assert.equal(doc.querySelector(".yukicoder-ko-machine-notice"), null);
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

test("sample copy mapping ignores removed worked traces between real inputs", async () => {
  const f = fixture();
  try {
    const trace = "<p>Explanation</p><pre>worked trace</pre>";
    f.state.canonical = `<div class="block"><h4>説明</h4>
      <div class="sample"><h6>入力</h6><pre>first\n</pre><h6>出力</h6><pre>one\n</pre>${trace}</div>
      <div class="sample"><h6>入力</h6><pre>second\n</pre><h6>出力</h6><pre>two\n</pre></div>
    </div>`;
    const doc = f.dom.window.document;
    doc.querySelector(".block")!.outerHTML = f.state.canonical;
    const translated = f.engine.parseHtml(f.state.body);
    translated.querySelector(".problem-statement")!.innerHTML =
      f.state.canonical
        .replace(trace, "<p>Translated explanation without a PRE</p>")
        .replaceAll("入力", "입력")
        .replaceAll("出力", "출력");
    translated.querySelector<HTMLElement>("main")!.dataset.sourceHtmlSha256 =
      hash(f.state.canonical);
    f.state.body = translated.documentElement.outerHTML;
    const copied: string[] = [];
    const buttons = [...doc.querySelectorAll(".sample")].map((sample) => {
      const button = doc.createElement("button");
      button.className = "copy-sample-input";
      button.onclick = () => {
        copied.push(
          button.closest(".sample")!.querySelector("pre")!.textContent!,
        );
      };
      sample.append(button);
      return button;
    });
    const result = await f.engine.translateProblem(() => true, f.catalog());
    assert.equal(result.status, "applied");
    if (result.status === "applied") await result.verification;
    buttons.forEach((button) => button.click());
    assert.deepEqual(copied, ["first\n", "second\n"]);
    f.engine.restoreProblem();
    assert.equal(doc.querySelectorAll(".sample").length, 2);
    assert.equal(doc.querySelectorAll(".copy-sample-input").length, 2);
  } finally {
    f.close();
  }
});

test("sample, catalog and control mismatches reject without changing the Japanese page", async () => {
  for (const kind of ["sample", "catalog", "controls"]) {
    const f = fixture();
    try {
      const catalog = f.catalog();
      if (kind === "sample") {
        f.state.body = translated("1 2\n");
        catalog.entries[0].htmlSha256 = hash(f.state.body);
      }
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
        (
          await f.engine.translateProblem(() => true, catalog, {
            refresh: true,
          })
        ).status,
        "unavailable",
      );
      assert.equal(f.saved["problem-translation-html:ko:1"], undefined);
      f.state.offline = true;
      const result = await f.engine.translateProblem(() => true, catalog, {
        refresh: true,
      });
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

test("late translations cannot apply after disabling and cached bodies report offline verification", async () => {
  const f = fixture({ samples: false });
  try {
    let enabled = true;
    const request = f.dom.window.fetch;
    f.dom.window.fetch = async (url, options) => {
      if (String(url).startsWith("https://translations.test/")) enabled = false;
      return request(url, options);
    };
    assert.equal(
      (await f.engine.translateProblem(() => enabled, f.catalog())).status,
      "cancelled",
    );
    assert.equal(
      f.dom.window.document.querySelector("h3")!.textContent,
      "No.1 題名",
    );
    f.state.offline = true;
    const result = await f.engine.translateProblem(() => true, f.catalog());
    assert.equal(result.status, "applied");
    assert.equal(
      result.status === "applied" && (await result.verification)?.status,
      "unavailable",
    );
  } finally {
    f.close();
  }
});

test("rendered DOM changes do not claim a historical API source change", async () => {
  const f = fixture();
  try {
    const doc = f.dom.window.document;
    const paragraph = doc.querySelector(".block p")!;
    const formula =
      '<span><span class="katex"><span class="katex-mathml"><math><semantics><annotation encoding="application/x-tex">N</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">N</span></span></span>';
    paragraph.innerHTML = formula;
    const applied = await f.engine.translateProblem();
    assert.equal(applied.status, "applied");
    assert.equal(
      applied.status === "applied" && (await applied.verification)?.status,
      "verified",
    );
    f.engine.restoreProblem();
    for (const changedMarkup of [
      formula + "changed",
      formula.replace("<span>", '<span title="authored">'),
      formula.replace(">N</annotation>", ">M</annotation>"),
    ]) {
      paragraph.innerHTML = changedMarkup;
      const changed = await f.engine.translateProblem();
      assert.equal(changed.status, "applied");
      assert.equal(
        changed.status === "applied" && (await changed.verification)?.status,
        "verified",
      );
      f.engine.restoreProblem();
    }
  } finally {
    f.close();
  }
});

test("slow source HTML does not delay translation and changed source is reported afterward", async () => {
  const f = fixture({ samples: false });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const request = f.dom.window.fetch;
  f.dom.window.fetch = async (url, options) => {
    if (String(url).endsWith("/html")) await gate;
    return request(url, options);
  };
  try {
    f.state.canonical = f.state.canonical.replace("$N$", "$Z$");
    const result = await f.engine.translateProblem(() => true, f.catalog());
    assert.equal(result.status, "applied");
    assert.equal(
      f.dom.window.document.querySelector("h3")!.textContent,
      "No.1 번역 제목",
    );
    release();
    assert.equal(
      result.status === "applied" && (await result.verification)?.status,
      "changed",
    );
    assert.equal(
      f.dom.window.document.querySelector("h3")!.textContent,
      "No.1 번역 제목",
    );
    f.engine.restoreProblem();
    assert.equal(
      f.dom.window.document.querySelector("h3")!.textContent,
      "No.1 題名",
    );
  } finally {
    release();
    f.close();
  }
});

test("site KaTeX renders prose and preserves ignored fenced code and literal sample bytes", async () => {
  const f = fixture();
  try {
    f.state.body = f.state.body.replace(
      "<h4>설명</h4>",
      "<h4>입력</h4><pre><code>$N$\n$S_1\\ S_2$\n</code></pre>",
    );
    const result = await f.engine.translateProblem();
    assert.equal(result.status, "applied");
    assert.equal(
      f.dom.window.document.querySelectorAll(".block > pre > code .katex")
        .length,
      0,
    );
    assert.equal(
      f.dom.window.document.querySelector(".block > pre > code")!.textContent,
      "$N$\n$S_1\\ S_2$\n",
    );
    assert.ok(f.dom.window.document.querySelector(".block > p .katex"));
    assert.equal(
      f.dom.window.document.querySelector(".sample pre")!.textContent,
      "1  2\n",
    );
    if (result.status === "applied") await result.verification;
  } finally {
    f.close();
  }
});

test("input-format presentation changes leave API source verification intact", async () => {
  const f = fixture();
  try {
    f.state.canonical = source.replace("<p>$N$</p>", "<pre>$S$\n</pre>");
    f.state.body = f.state.body.replace(hash(source), hash(f.state.canonical));
    const formula =
      '<span><span class="katex"><span class="katex-mathml"><math><semantics><annotation encoding="application/x-tex">S</annotation></semantics></math></span></span></span>';
    f.dom.window.document.querySelector(".block p")!.outerHTML =
      `<pre>${formula}\n</pre>`;
    const result = await f.engine.translateProblem(() => true, f.catalog());
    assert.equal(result.status, "applied");
    assert.equal(
      result.status === "applied" && (await result.verification)?.status,
      "verified",
    );
    f.engine.restoreProblem();
    const pre = f.dom.window.document.querySelector(".block > pre")!;
    for (const changed of [
      ` ${formula}\n`,
      `${formula.replace(">S</annotation>", ">T</annotation>")}\n`,
    ]) {
      pre.innerHTML = changed;
      const result = await f.engine.translateProblem(() => true, f.catalog());
      assert.equal(
        result.status === "applied" && (await result.verification)?.status,
        "verified",
      );
      f.engine.restoreProblem();
    }
  } finally {
    f.close();
  }
});

test("MathJax output repeatedly verifies while real API changes still warn", async () => {
  const f = fixture();
  try {
    const paragraph = f.dom.window.document.querySelector(".block p")!;
    paragraph.innerHTML =
      '<mjx-container class="MathJax" jax="CHTML" tabindex="0"><mjx-math aria-hidden="true"><mjx-mi><mjx-c class="mjx-c1D441"></mjx-c></mjx-mi></mjx-math><mjx-assistive-mml><math><mi>N</mi></math></mjx-assistive-mml></mjx-container>';
    for (let i = 0; i < 6; i++) {
      const result = await f.engine.translateProblem();
      assert.equal(result.status, "applied");
      assert.equal(
        result.status === "applied" && (await result.verification)?.status,
        "verified",
      );
      f.engine.restoreProblem();
      assert.ok(paragraph.querySelector("mjx-container"));
    }
    f.state.canonical = source.replace("$N$", "$Z$");
    const changed = await f.engine.translateProblem(() => true, undefined, {
      refresh: true,
    });
    assert.equal(changed.status, "applied");
    assert.equal(
      changed.status === "applied" && (await changed.verification)?.status,
      "changed",
    );
  } finally {
    f.close();
  }
});

test("language toggles reuse translation and verification offline; refresh and new versions revalidate", async () => {
  const f = fixture();
  try {
    const first = await f.engine.translateProblem(() => true, f.catalog());
    assert.equal(
      first.status === "applied" && (await first.verification)?.status,
      "verified",
    );
    const requests = f.calls.length;
    f.state.offline = true;
    for (let i = 0; i < 3; i++) {
      f.engine.restoreProblem();
      const result = await f.engine.translateProblem(() => true, f.catalog());
      assert.equal(
        result.status === "applied" && (await result.verification)?.status,
        "verified",
      );
    }
    assert.equal(f.calls.length, requests);
    f.state.offline = false;
    const refreshed = await f.engine.translateProblem(() => true, f.catalog(), {
      refresh: true,
    });
    assert.equal(
      refreshed.status === "applied" && (await refreshed.verification)?.status,
      "verified",
    );
    assert.equal(f.calls.length, requests + 3);
    f.state.body = f.state.body.replace("번역 제목", "새 제목");
    const updated = await f.engine.translateProblem(() => true, f.catalog());
    assert.equal(
      updated.status === "applied" && (await updated.verification)?.status,
      "verified",
    );
    assert.equal(f.calls.length, requests + 6);
    assert.equal(
      f.dom.window.document.querySelector("h3")!.textContent,
      "No.1 새 제목",
    );
    const removed = { ...f.catalog(), entries: [] };
    assert.equal(
      (await f.engine.translateProblem(() => true, removed)).status,
      "unavailable",
    );
    assert.equal(
      f.dom.window.document.querySelector("h3")!.textContent,
      "No.1 題名",
    );
  } finally {
    f.close();
  }
});

test("switching views shares in-flight downloads and verification while cancelling stale application", async () => {
  const f = fixture({ samples: false });
  let releaseBody!: () => void;
  let releaseSource!: () => void;
  const bodyGate = new Promise<void>((resolve) => {
    releaseBody = resolve;
  });
  const sourceGate = new Promise<void>((resolve) => {
    releaseSource = resolve;
  });
  const request = f.dom.window.fetch;
  f.dom.window.fetch = async (url, options) => {
    const response = request(url, options);
    if (String(url).startsWith("https://translations.test/")) await bodyGate;
    if (String(url).endsWith("/html")) await sourceGate;
    return response;
  };
  try {
    const stale = f.engine.translateProblem(() => true, f.catalog());
    f.engine.restoreProblem();
    const latest = f.engine.translateProblem(() => true, f.catalog());
    releaseBody();
    assert.equal((await stale).status, "cancelled");
    const first = await latest;
    assert.equal(first.status, "applied");
    f.engine.restoreProblem();
    const second = await f.engine.translateProblem(() => true, f.catalog());
    releaseSource();
    assert.equal(
      first.status === "applied" && (await first.verification)?.status,
      "cancelled",
    );
    assert.equal(
      second.status === "applied" && (await second.verification)?.status,
      "verified",
    );
    assert.equal(
      f.calls.filter((url) => url.startsWith("https://translations.test/"))
        .length,
      1,
    );
    assert.equal(f.calls.filter((url) => url.endsWith("/html")).length, 1);
  } finally {
    releaseBody();
    releaseSource();
    f.close();
  }
});

for (const change of ["blocks", "container", "identity", "missing"]) {
  test(`download completion rechecks current statement after ${change} replacement`, async () => {
    const f = fixture();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const request = f.dom.window.fetch;
    f.dom.window.fetch = async (url, options) => {
      if (String(url).startsWith("https://translations.test/")) await gate;
      return request(url, options);
    };
    try {
      const pending = f.engine.translateProblem(() => true, f.catalog());
      const doc = f.dom.window.document;
      const old = doc.querySelector("#content")!;
      if (change === "blocks") {
        for (const block of old.querySelectorAll(".block"))
          block.replaceWith(block.cloneNode(true));
      } else if (change === "container") old.replaceWith(old.cloneNode(true));
      else if (change === "identity") old.setAttribute("data-problem-id", "99");
      else old.querySelector(".block")!.remove();
      const before = doc.body.innerHTML;
      release();
      const outcome = await pending;
      if (change === "blocks" || change === "container") {
        assert.equal(outcome.status, "applied");
        assert.equal(
          outcome.status === "applied" && (await outcome.verification)?.status,
          "verified",
        );
        assert.equal(doc.querySelector(".block h4")!.textContent, "설명");
        f.engine.restoreProblem();
        assert.equal(doc.body.innerHTML, before);
      } else {
        assert.equal(
          outcome.status,
          change === "identity" ? "cancelled" : "failed",
        );
        assert.equal(doc.body.innerHTML, before);
      }
    } finally {
      release();
      f.close();
    }
  });
}

test("unwrapped leading Note like problem 459 is replaced and restored without touching page controls", async () => {
  const f = fixture();
  try {
    const note =
      '<h4 class="shadow">Note</h4><p>Original note <a href="https://example.com/">link</a></p>';
    f.state.canonical = note + source;
    f.state.body = f.state.body
      .replace(hash(source), hash(f.state.canonical))
      .replace(
        '<div class="problem-statement">',
        '<div class="problem-statement"><div class="block"><h4>참고</h4><p>Translated note</p></div>',
      );
    const doc = f.dom.window.document;
    doc
      .querySelector(".block")!
      .insertAdjacentHTML(
        "beforebegin",
        '<p id="controls"><button>site control</button></p>' + note,
      );
    const original = doc.body.innerHTML;
    const control = doc.querySelector("#controls")!;
    let clicks = 0;
    control.querySelector("button")!.addEventListener("click", () => clicks++);
    for (let i = 0; i < 2; i++) {
      const result = await f.engine.translateProblem(() => true, f.catalog());
      assert.equal(
        result.status === "applied" && (await result.verification)?.status,
        "verified",
      );
      assert.equal(doc.querySelector("#content > h4"), null);
      assert.equal(doc.querySelector(".block h4")!.textContent, "참고");
      assert.equal(doc.querySelector("#controls"), control);
      (control.querySelector("button") as HTMLButtonElement).click();
      f.engine.restoreProblem();
      assert.equal(doc.body.innerHTML, original);
    }
    assert.equal(clicks, 2);
  } finally {
    f.close();
  }
});

test("replacement refuses detached targets before writing or rolling back current site content", async () => {
  const f = fixture();
  try {
    const doc = f.dom.window.document;
    const blocks = [...doc.querySelectorAll("#content > .block")];
    const apply = await f.engine.prepareReplacement(
      f.engine.parseTranslationDocument(f.state.body, 1, "18"),
      doc.querySelector("h3")!,
      blocks,
      blocks,
      { profile: { engine: "katex", version: "0.17.0" } },
    );
    blocks[0].replaceWith(blocks[0].cloneNode(true));
    const before = doc.body.innerHTML;
    assert.throws(apply, /page changed before translation/);
    assert.equal(doc.body.innerHTML, before);
  } finally {
    f.close();
  }
});

for (const invalid of ["metadata", "body"]) {
  test(`invalid HTTP 200 ${invalid} warns unavailable and source-only retry recovers without replacement`, async () => {
    const f = fixture({ samples: false });
    const request = f.dom.window.fetch;
    let broken = true;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.dom.window.fetch = async (url, options) => {
      const response = await request(url, options);
      if (!String(url).includes("/api/")) return response;
      if (!broken) await gate;
      if (broken && String(url).endsWith("/html") === (invalid === "body"))
        return invalid === "body"
          ? new Response("Sign in required")
          : Response.json({ error: "rate limited" });
      return response;
    };
    try {
      const catalog = f.catalog();
      const first = await f.engine.translateProblem(() => true, catalog);
      assert.equal(
        first.status === "applied" && (await first.verification)?.status,
        "unavailable",
      );
      const doc = f.dom.window.document;
      const body = doc.querySelector(".block");
      const before = doc.body.innerHTML;
      broken = false;
      let enabled = true;
      const [stale, latest] = await Promise.all([
        f.engine.translateProblem(() => enabled, catalog, {
          retryVerification: true,
        }),
        f.engine.translateProblem(() => true, catalog, {
          retryVerification: true,
        }),
      ]);
      assert.equal(stale.status, "applied");
      assert.equal(latest.status, "applied");
      assert.equal(doc.querySelector(".block"), body);
      assert.equal(doc.body.innerHTML, before);
      assert.equal(
        f.calls.filter((url) => url.includes("translations.test")).length,
        1,
      );
      assert.equal(f.calls.filter((url) => url.includes("/api/")).length, 4);
      enabled = false;
      release();
      assert.equal(
        stale.status === "applied" && (await stale.verification)?.status,
        "cancelled",
      );
      assert.equal(
        latest.status === "applied" && (await latest.verification)?.status,
        "verified",
      );
      assert.equal(doc.querySelector(".block"), body);
    } finally {
      release();
      f.close();
    }
  });
}

for (const toggle of [false, true]) {
  test(`failed verification is retried by the next translation ${toggle ? "after restoration" : "while applied"}`, async () => {
    const f = fixture({ samples: false });
    const request = f.dom.window.fetch;
    let offline = true;
    f.dom.window.fetch = async (url, options) => {
      const response = await request(url, options);
      if (offline && String(url).includes("/api/")) throw new Error("offline");
      return response;
    };
    try {
      const first = await f.engine.translateProblem();
      assert.equal(
        first.status === "applied" && (await first.verification)?.status,
        "unavailable",
      );
      const block = f.dom.window.document.querySelector(".block");
      if (toggle) f.engine.restoreProblem();
      offline = false;
      const recovered = await f.engine.translateProblem();
      assert.equal(
        recovered.status === "applied" &&
          (await recovered.verification)?.status,
        "verified",
      );
      if (!toggle)
        assert.equal(f.dom.window.document.querySelector(".block"), block);
      assert.equal(
        f.calls.filter((url) => url.includes("translations.test")).length,
        1,
      );
      assert.equal(f.calls.filter((url) => url.endsWith("/html")).length, 2);
    } finally {
      f.close();
    }
  });
}

for (const cancel of [
  "restore",
  "container",
  "blocks",
  "identity",
  "path",
  "config",
]) {
  test(`source retry ignores late verification after ${cancel} invalidates ownership`, async () => {
    const f = fixture({ samples: false });
    const request = f.dom.window.fetch;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.dom.window.fetch = async (url, options) => {
      const response = await request(url, options);
      if (String(url).includes("/api/")) await gate;
      return response;
    };
    try {
      const first = await f.engine.translateProblem();
      const retry = await f.engine.translateProblem(() => true, undefined, {
        retryVerification: true,
      });
      assert.equal(retry.status, "applied");
      const doc = f.dom.window.document;
      if (cancel === "restore") f.engine.restoreProblem();
      if (cancel === "container")
        doc.querySelector("#content")!.replaceWith(doc.createElement("main"));
      if (cancel === "blocks") doc.querySelector(".block")!.remove();
      if (cancel === "identity")
        doc.querySelector("#content")!.setAttribute("data-problem-id", "99");
      if (cancel === "path")
        f.dom.window.history.replaceState({}, "", "/problems/no/2");
      if (cancel === "config")
        Object.assign(
          (f.dom.window as unknown as Window & typeof globalThis)
            .YUKICODER_KO_CONFIG!,
          {
            problemTranslationBaseUrl: "https://other.test/",
          },
        );
      const before = doc.body.innerHTML;
      release();
      assert.equal(
        first.status === "applied" && (await first.verification)?.status,
        "cancelled",
      );
      assert.equal(
        retry.status === "applied" && (await retry.verification)?.status,
        "cancelled",
      );
      assert.equal(doc.body.innerHTML, before);
      assert.equal(
        (
          await f.engine.translateProblem(() => true, undefined, {
            retryVerification: true,
          })
        ).status,
        "cancelled",
      );
      assert.equal(f.calls.length, 3);
    } finally {
      release();
      f.close();
    }
  });
}

for (const detach of ["container", "statement"]) {
  test(`next translate reapplies after site replaces the ${detach} without overwriting site content on restore`, async () => {
    const f = fixture({ samples: false });
    try {
      const first = await f.engine.translateProblem();
      assert.equal(
        first.status === "applied" && (await first.verification)?.status,
        "verified",
      );
      const doc = f.dom.window.document;
      if (detach === "container") {
        const current = doc.createElement("main");
        current.id = "content";
        current.dataset.problemId = "18";
        current.innerHTML = `<h3>Site refreshed title</h3>${f.state.canonical}`;
        doc.querySelector("#content")!.replaceWith(current);
      } else {
        doc.querySelector(".block")!.outerHTML = f.state.canonical;
        doc.querySelector("h3")!.textContent = "Site refreshed title";
      }
      const newBlock = doc.querySelector(".block");
      const second = await f.engine.translateProblem();
      assert.equal(second.status, "applied");
      assert.equal(
        second.status === "applied" && (await second.verification)?.status,
        "verified",
      );
      assert.equal(doc.querySelector(".block h4")!.textContent, "설명");
      f.engine.restoreProblem();
      assert.equal(doc.querySelector(".block"), newBlock);
      assert.equal(doc.querySelectorAll(".block").length, 1);
      assert.equal(
        doc.querySelector("h3")!.textContent,
        "Site refreshed title",
      );
      assert.equal(f.calls.length, 3);
    } finally {
      f.close();
    }
  });
}

test("unknown live render settings fail as retryable network/settings without changing Japanese", async () => {
  const f = fixture();
  try {
    f.dom.window.document.querySelector("script")!.remove();
    const before = f.dom.window.document.body.innerHTML;
    const outcome = await f.engine.translateProblem();
    assert.equal(outcome.status, "failed");
    assert.equal(outcome.status === "failed" && outcome.reason, "network");
    assert.equal(f.dom.window.document.body.innerHTML, before);
    assert.equal(f.calls.filter((url) => url.includes("/api/")).length, 0);
  } finally {
    f.close();
  }
});

test("legacy sample checks wait for raw canonical HTML and ignore MathJax sample presentation", async () => {
  const f = fixture();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const request = f.dom.window.fetch;
  f.dom.window.fetch = async (url, options) => {
    const response = await request(url, options);
    if (String(url).endsWith("/html")) await gate;
    return response;
  };
  try {
    const doc = f.dom.window.document;
    doc.querySelector(".sample pre")!.innerHTML =
      "<mjx-container>rendered sample presentation</mjx-container>";
    let settled = false;
    const pending = f.engine.translateProblem().then((outcome) => {
      settled = true;
      return outcome;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(settled, false);
    assert.equal(doc.querySelector("h3")!.textContent, "No.1 題名");
    release();
    const outcome = await pending;
    assert.equal(outcome.status, "applied");
    assert.equal(
      outcome.status === "applied" && (await outcome.verification)?.status,
      "verified",
    );
    assert.equal(doc.querySelector(".sample pre")!.textContent, "1  2\n");
    assert.equal(f.calls.length, 3);
  } finally {
    release();
    f.close();
  }
});

test("published sample digest allows translation before source verification and preserves raw sample checks", async () => {
  const f = fixture();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const request = f.dom.window.fetch;
  f.dom.window.fetch = async (url, options) => {
    const response = await request(url, options);
    if (String(url).includes("/api/")) await gate;
    return response;
  };
  try {
    const catalog = f.catalog();
    const doc = f.dom.window.document;
    doc.querySelector(".sample pre")!.innerHTML =
      "<mjx-container>site rendered input</mjx-container>";
    const outcome = await f.engine.translateProblem(() => true, catalog);
    assert.equal(outcome.status, "applied");
    assert.equal(doc.querySelector(".sample pre")!.textContent, "1  2\n");
    release();
    assert.equal(
      outcome.status === "applied" && (await outcome.verification)?.status,
      "verified",
    );
    assert.equal(f.calls.length, 3);
  } finally {
    release();
    f.close();
  }
});

test("source-only retry during an in-flight translation cancels only the retry", async () => {
  const f = fixture({ samples: false });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const request = f.dom.window.fetch;
  f.dom.window.fetch = async (url, options) => {
    const response = await request(url, options);
    if (String(url).includes("translations.test")) await gate;
    return response;
  };
  try {
    const pending = f.engine.translateProblem();
    const retried = await f.engine.translateProblem(() => true, undefined, {
      retryVerification: true,
    });
    assert.equal(retried.status, "cancelled");
    release();
    const outcome = await pending;
    assert.equal(outcome.status, "applied");
    assert.equal(
      outcome.status === "applied" && (await outcome.verification)?.status,
      "verified",
    );
    assert.equal(f.calls.length, 3);
  } finally {
    release();
    f.close();
  }
});

test("unavailable verification after cancelling a view stays retryable for its replacement view", async () => {
  const f = fixture({ samples: false });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const request = f.dom.window.fetch;
  let offline = true;
  f.dom.window.fetch = async (url, options) => {
    const response = await request(url, options);
    if (String(url).includes("/api/") && offline) {
      await gate;
      throw new Error("offline");
    }
    return response;
  };
  try {
    const first = await f.engine.translateProblem();
    const firstRetry = await f.engine.translateProblem(() => true, undefined, {
      retryVerification: true,
    });
    f.engine.restoreProblem();
    const next = await f.engine.translateProblem();
    assert.equal(f.calls.length, 3, "new view must share pending verification");
    release();
    assert.equal(
      first.status === "applied" && (await first.verification)?.status,
      "cancelled",
    );
    assert.equal(
      firstRetry.status === "applied" &&
        (await firstRetry.verification)?.status,
      "cancelled",
    );
    assert.equal(
      next.status === "applied" && (await next.verification)?.status,
      "unavailable",
    );
    offline = false;
    const block = f.dom.window.document.querySelector(".block");
    const recovered = await f.engine.translateProblem(() => true, undefined, {
      retryVerification: true,
    });
    assert.equal(
      recovered.status === "applied" && (await recovered.verification)?.status,
      "verified",
    );
    assert.equal(f.dom.window.document.querySelector(".block"), block);
    assert.equal(
      f.calls.filter((url) => url.includes("translations.test")).length,
      1,
    );
    assert.equal(f.calls.filter((url) => url.includes("/api/")).length, 4);
  } finally {
    release();
    f.close();
  }
});

for (const engine of ["katex", "mathjax"] as const) {
  test(`${engine} profile renders title and pre formulas, keeps code and ignored text, and restores original nodes`, async () => {
    const f = fixture({ samples: false });
    try {
      const doc = f.dom.window.document;
      doc.querySelector("script")!.src =
        engine === "katex"
          ? "https://cdn.jsdelivr.net/npm/katex@0.17.0/dist/katex.min.js"
          : "https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-mml-chtml.js";
      const runtime = (f.dom.window as unknown as Window & typeof globalThis)
        .chrome!.runtime!;
      runtime.getURL = (path: string) => `chrome-extension://fixture/${path}`;
      f.state.body = f.state.body
        .replace("No.1 번역 제목", "No.1 $T^2$ 제목")
        .replace(
          "<p>$M^2$</p>",
          '<p>$M^2$</p><pre id="format">$P$\n</pre><pre id="fenced"><code>$C$\n</code></pre><p class="tex2jax_ignore">$I$</p>',
        );
      const title = doc.querySelector("h3")!;
      const originalTitle = title.firstChild;
      const originalBlock = doc.querySelector(".block");
      const outcome = await f.engine.translateProblem();
      assert.equal(
        outcome.status,
        "applied",
        outcome.status === "failed" ? outcome.detail : undefined,
      );
      const formula = engine === "katex" ? ".katex" : "mjx-container";
      assert.ok(title.querySelector(formula));
      assert.ok(doc.querySelector(`#format ${formula}`));
      assert.equal(doc.querySelector("#fenced code")!.textContent, "$C$\n");
      assert.equal(doc.querySelector(`#fenced ${formula}`), null);
      assert.equal(doc.querySelector(".tex2jax_ignore")!.textContent, "$I$");
      if (engine === "mathjax") {
        assert.match(
          doc.querySelector("#yukicoder-ko-MathJax-CHTML-styles")!.textContent!,
          /chrome-extension:\/\/fixture\/mathjax\/fonts\/woff-v2/,
        );
        assert.equal(doc.querySelector(".katex"), null);
      } else assert.equal(doc.querySelector("mjx-container"), null);
      assert.equal(
        outcome.status === "applied" && (await outcome.verification)?.status,
        "verified",
      );
      f.engine.restoreProblem();
      assert.equal(title.firstChild, originalTitle);
      assert.equal(doc.querySelector(".block"), originalBlock);
    } finally {
      f.close();
    }
  });
}

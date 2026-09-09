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
      },
    ],
  });
  return { dom, close, state, engine, saved, calls, catalog };
}

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
  const f = fixture();
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

test("KaTeX auto-render wrappers preserve source verification without hiding authored changes", async () => {
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
        "changed",
      );
      f.engine.restoreProblem();
    }
  } finally {
    f.close();
  }
});

test("slow source HTML does not delay translation and changed source is reported afterward", async () => {
  const f = fixture();
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
    f.state.canonical = source.replace("$N$", "$Z$");
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

test("input format math renders inside fenced code while sample bytes stay literal", async () => {
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
      2,
    );
    assert.equal(
      f.dom.window.document.querySelector(".sample pre")!.textContent,
      "1  2\n",
    );
    if (result.status === "applied") await result.verification;
  } finally {
    f.close();
  }
});

test("input-format math like problem 457 verifies after site rendering without erasing whitespace changes", async () => {
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
        "changed",
      );
      f.engine.restoreProblem();
    }
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
  const f = fixture();
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

test("replacement refuses detached targets before writing or rolling back current site content", () => {
  const f = fixture();
  try {
    const doc = f.dom.window.document;
    const blocks = [...doc.querySelectorAll("#content > .block")];
    const apply = f.engine.prepareReplacement(
      f.engine.parseTranslationDocument(f.state.body, 1, "18"),
      doc.querySelector("h3")!,
      blocks,
      blocks,
    );
    blocks[0].replaceWith(blocks[0].cloneNode(true));
    const before = doc.body.innerHTML;
    assert.throws(apply, /page changed before translation/);
    assert.equal(doc.body.innerHTML, before);
  } finally {
    f.close();
  }
});

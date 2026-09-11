import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { compileProblemMarkdown } from "translation-core/problem-markdown";
import { bundle, page, settle } from "./extension-fixture.ts";
import type { ProblemOutcome } from "../problem-engine.ts";

const engineCode = await bundle("src/problem-translations.ts");
const contentCode = await bundle("src/content.ts", [
  { problemNo: 1, problemId: 18, source: "題名", target: "제목" },
  { problemNo: 2, problemId: 19, source: "参照問題", target: "참조 문제" },
]);

test("full content integration preserves introductory prose and verifies original reference titles across toggles", async () => {
  const source =
    '<div class="block"><h4>問題文</h4><p>Execution warning</p><p><a href="/problems/no/2">No.2 参照問題</a></p></div>';
  const digest = createHash("sha256").update(source).digest("hex");
  const translated = compileProblemMarkdown(`---
schemaVersion: 1
locale: ko
problemNo: 1
problemId: 18
sourceTitle: 題名
sourceHtmlSha256: ${digest}
reviewStatus: unreviewed
title: 제목
---

Execution warning

## Statement

Translated statement
`);
  const { dom, close } = page(
    `<head><script src="https://cdn.jsdelivr.net/npm/katex@0.17.0/dist/katex.min.js"></script></head><main id="content" data-problem-id="18"><h3>No.1 題名</h3><nav><a href="/problems/no/2">No.2 参照問題</a></nav>${source}</main>`,
  );
  const calls: string[] = [];
  Object.assign(dom.window, {
    YUKICODER_KO_CONFIG: {
      problemTranslationBaseUrl: "https://translations.test/",
    },
    chrome: {
      runtime: { getURL: (p: string) => p },
      storage: { local: { get: async () => ({}) } },
    },
    fetch: async (url: string | URL) => {
      const path = String(url);
      calls.push(path);
      if (path.startsWith("translations/"))
        return Response.json({ translations: [] });
      if (path.startsWith("https://translations.test/"))
        return new Response(translated);
      if (path.endsWith("/html")) return new Response(source);
      return Response.json({ No: 1, ProblemId: 18, Title: "題名" });
    },
  });
  try {
    dom.window.eval(engineCode);
    dom.window.eval(contentCode);
    for (let i = 0; i < 5; i++) await settle();
    const doc = dom.window.document;
    const notice = () => doc.querySelector("#yukicoder-ko-status")!;
    assert.equal(notice().firstChild!.textContent, "한국어 번역본 입니다.");
    assert.equal(
      doc.querySelector("#content > p:not([role])")!.textContent,
      "Execution warning",
    );
    const requests = calls.length;
    for (let i = 0; i < 2; i++) {
      notice().querySelector<HTMLButtonElement>("button")!.click();
      await settle();
      assert.equal(doc.querySelector("#content > .block")!.outerHTML, source);
      assert.equal(doc.querySelector("nav a")!.textContent, "No.2 참조 문제");
      notice().querySelector<HTMLButtonElement>("button")!.click();
      for (let j = 0; j < 5; j++) await settle();
      assert.equal(notice().firstChild!.textContent, "한국어 번역본 입니다.");
      assert.equal(
        doc.querySelector("#content > p:not([role])")!.textContent,
        "Execution warning",
      );
    }
    assert.equal(
      calls.length,
      requests,
      "toggles reuse translations and source verification",
    );
  } finally {
    close();
  }
});

const observerSource =
  '<div class="block"><h4>問題文</h4><p>Japanese body $N$</p></div>';
const observerTranslation = compileProblemMarkdown(`---
schemaVersion: 1
locale: ko
problemNo: 1
problemId: 18
sourceTitle: 題名
sourceHtmlSha256: ${createHash("sha256").update(observerSource).digest("hex")}
reviewStatus: unreviewed
title: 제목
---

## Statement

Translated body $M$
`);
const observerContent = `<main id="content" data-problem-id="18"><h3>No.1 題名</h3>${observerSource}</main>`;
const flushPage = async () => {
  for (let i = 0; i < 3; i++) await settle();
};
function observerFixture(engine: "katex" | "mathjax" = "katex") {
  const script =
    engine === "katex"
      ? "https://cdn.jsdelivr.net/npm/katex@0.17.0/dist/katex.min.js"
      : "https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-mml-chtml.js";
  const { dom, close } = page(
    `<head><script src="${script}"></script></head><body><span id="ui">source</span>${observerContent}</body>`,
  );
  const state = {
    bodyCalls: 0,
    sourceRetries: 0,
    restores: 0,
    catalogs: 0,
    requests: [] as string[],
    offline: false,
    sourceGate: undefined as Promise<void> | undefined,
    beforeTranslate: undefined as (() => Promise<void>) | undefined,
    outcomes: [] as ProblemOutcome[],
  };
  let changed!: (
    changes: Record<string, { newValue: boolean }>,
    area: string,
  ) => void;
  Object.assign(dom.window, {
    YUKICODER_KO_CONFIG: {
      problemTranslationBaseUrl: "https://translations.test/",
    },
    chrome: {
      runtime: {
        getURL: (path: string) => path,
        sendMessage: async (request: { type: string }) => {
          if (request.type !== "problem-catalog:get") return { ok: true };
          state.catalogs++;
          return {
            ok: true,
            source: "remote",
            catalog: {
              schemaVersion: 1,
              revision: "a".repeat(64),
              entries: [
                {
                  problemNo: 1,
                  problemId: 18,
                  source: "題名",
                  target: "제목",
                  htmlSha256: createHash("sha256")
                    .update(observerTranslation)
                    .digest("hex"),
                },
              ],
            },
          };
        },
      },
      storage: {
        local: { get: async () => ({}) },
        onChanged: {
          addListener(fn: typeof changed) {
            changed = fn;
          },
        },
      },
    },
    fetch: async (url: string | URL) => {
      const path = String(url);
      state.requests.push(path);
      if (path.startsWith("translations/"))
        return Response.json({
          translations: [
            { selector: "#ui", source: "source", target: "target" },
          ],
        });
      if (path.startsWith("https://translations.test/"))
        return new Response(observerTranslation);
      await state.sourceGate;
      if (state.offline) throw new Error("source offline");
      return path.endsWith("/html")
        ? new Response(observerSource)
        : Response.json({ No: 1, ProblemId: 18, Title: "題名" });
    },
  });
  const host = dom.window as unknown as Window & typeof globalThis;
  dom.window.eval(engineCode);
  const api = host.yukicoderProblemTranslations!;
  host.yukicoderProblemTranslations = {
    restoreProblem() {
      state.restores++;
      api.restoreProblem();
    },
    async translateProblem(...args) {
      if (args[2]?.retryVerification) state.sourceRetries++;
      else {
        state.bodyCalls++;
        assert.ok(
          state.bodyCalls < 10,
          "observer must not feed a translation loop",
        );
        await state.beforeTranslate?.();
      }
      const outcome = await api.translateProblem(...args);
      state.outcomes.push(outcome);
      return outcome;
    },
  };
  return {
    dom,
    close,
    state,
    start: async () => {
      dom.window.eval(contentCode);
      await flushPage();
    },
    setEnabled: (enabled: boolean) =>
      changed({ translationEnabled: { newValue: enabled } }, "local"),
    click: (label: string) => {
      const button = [
        ...dom.window.document.querySelectorAll<HTMLButtonElement>(
          "#yukicoder-ko-status button",
        ),
      ].find((button) => button.textContent === label);
      assert.ok(button, `Missing action: ${label}`);
      button.click();
    },
  };
}

for (const engine of ["katex", "mathjax"] as const) {
  for (const replacement of ["block", "container"] as const) {
    test(`${engine} observer coalesces ${replacement} replacements without resetting UI or refetching resources`, async () => {
      const f = observerFixture(engine);
      try {
        await f.start();
        const doc = f.dom.window.document;
        assert.equal(f.state.bodyCalls, 1);
        const first = f.state.outcomes[0];
        assert.ok(first.status === "applied" && first.isApplied?.());
        const requests = [...f.state.requests];
        const restores = f.state.restores;
        const ui = doc.querySelector("#ui")!;
        let uiWrites = 0;
        const uiObserver = new f.dom.window.MutationObserver((records) => {
          uiWrites += records.length;
        });
        uiObserver.observe(ui, {
          childList: true,
          characterData: true,
          subtree: true,
        });
        for (let i = 0; i < 3; i++) {
          if (replacement === "block")
            doc.querySelector("#content > .block")!.outerHTML = observerSource;
          else doc.querySelector("#content")!.outerHTML = observerContent;
        }
        const sourceNode = doc.querySelector("#content > .block");
        assert.equal(first.status === "applied" && first.isApplied?.(), false);
        await flushPage();
        assert.equal(f.state.bodyCalls, 2);
        assert.match(
          doc.querySelector("#content > .block")!.textContent!,
          /Translated body/,
        );
        assert.equal(
          doc.querySelector("#yukicoder-ko-status")!.firstChild!.textContent,
          "한국어 번역본 입니다.",
        );
        assert.equal(doc.querySelector("#ui"), ui);
        assert.equal(ui.textContent, "target");
        assert.equal(uiWrites, 0);
        assert.equal(f.state.restores, restores);
        assert.equal(f.state.catalogs, 1);
        assert.deepEqual(f.state.requests, requests);
        // MathJax's generated descendants and unrelated site updates retain ownership.
        const formula = doc.querySelector(
          engine === "katex" ? ".block .katex" : ".block mjx-container",
        )!;
        for (let i = 0; i < 4; i++) {
          formula.append(doc.createComment(`render update ${i}`));
          await settle();
        }
        assert.equal(f.state.bodyCalls, 2);
        assert.deepEqual(f.state.requests, requests);
        f.click("원문 보기");
        await flushPage();
        assert.equal(doc.querySelector("#content > .block"), sourceNode);
        assert.equal(doc.querySelectorAll("#content > .block").length, 1);
        assert.equal(
          doc.querySelector("#content > h3")!.textContent,
          "No.1 題名",
        );
        uiObserver.disconnect();
      } finally {
        f.close();
      }
    });
  }
}

for (const mode of ["original", "disabled", "pagehide"] as const) {
  for (const pending of [false, true]) {
    test(`observer respects ${mode} ${pending ? "during reapplication" : "before body replacement"}`, async () => {
      const f = observerFixture();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      try {
        await f.start();
        const doc = f.dom.window.document;
        const requests = [...f.state.requests];
        if (pending) {
          f.state.beforeTranslate = () => gate;
          doc.querySelector(".block")!.outerHTML = observerSource;
          await flushPage();
          assert.equal(f.state.bodyCalls, 2);
        }
        if (mode === "original") f.click("원문 보기");
        if (mode === "disabled") f.setEnabled(false);
        if (mode === "pagehide")
          f.dom.window.dispatchEvent(new f.dom.window.Event("pagehide"));
        doc.querySelector("#content")!.outerHTML = observerContent;
        release();
        await flushPage();
        assert.equal(
          doc.querySelector("#content > .block")!.outerHTML,
          observerSource,
        );
        assert.equal(f.state.bodyCalls, pending ? 2 : 1);
        assert.deepEqual(f.state.requests, requests);
        assert.equal(f.state.catalogs, 1);
      } finally {
        release();
        f.close();
      }
    });
  }
}

test("automatic reapplication shares pending source verification and handles staggered insertion", async () => {
  const f = observerFixture();
  let release!: () => void;
  f.state.sourceGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await f.start();
    const doc = f.dom.window.document;
    const requests = [...f.state.requests];
    doc.querySelector(".block")!.remove();
    await flushPage();
    assert.equal(
      f.state.bodyCalls,
      1,
      "do not attempt to render an incomplete site rebuild",
    );
    doc
      .querySelector("#content")!
      .insertAdjacentHTML("beforeend", observerSource);
    await flushPage();
    assert.equal(f.state.bodyCalls, 2);
    assert.deepEqual(f.state.requests, requests);
    release();
    await flushPage();
    const [first, second] = f.state.outcomes;
    assert.equal(
      first.status === "applied" && (await first.verification)?.status,
      "cancelled",
    );
    assert.equal(
      second.status === "applied" && (await second.verification)?.status,
      "verified",
    );
    assert.match(doc.querySelector(".block")!.textContent!, /Translated body/);
    assert.equal(
      doc.querySelector("#yukicoder-ko-status")!.firstChild!.textContent,
      "한국어 번역본 입니다.",
    );
  } finally {
    release();
    f.close();
  }
});

test("body replacement recovers a cancelled source-only retry without leaving stale warnings", async () => {
  const f = observerFixture();
  f.state.offline = true;
  try {
    await f.start();
    const doc = f.dom.window.document;
    assert.match(
      doc.querySelector("#yukicoder-ko-status")!.textContent!,
      /확인하지 못했습니다/,
    );
    f.state.offline = false;
    doc.querySelector(".block")!.outerHTML = observerSource;
    f.click("다시 시도");
    await flushPage();
    assert.equal(f.state.bodyCalls, 2);
    assert.equal(f.state.sourceRetries, 1);
    assert.equal(
      f.state.requests.filter((path) => path.includes("translations.test"))
        .length,
      1,
    );
    assert.equal(
      f.state.requests.filter((path) => path.includes("/api/")).length,
      4,
    );
    assert.equal(f.state.catalogs, 1);
    assert.match(doc.querySelector(".block")!.textContent!, /Translated body/);
    assert.equal(
      doc.querySelector("#yukicoder-ko-status")!.firstChild!.textContent,
      "한국어 번역본 입니다.",
    );
  } finally {
    f.close();
  }
});

test("failed reapplication settles until site targets change again", async () => {
  const f = observerFixture();
  try {
    await f.start();
    const doc = f.dom.window.document;
    const script = doc.querySelector("script[src]")!;
    const src = script.getAttribute("src")!;
    script.remove();
    doc.querySelector(".block")!.outerHTML = observerSource;
    await flushPage();
    assert.equal(f.state.bodyCalls, 2);
    assert.equal(doc.querySelector(".block")!.outerHTML, observerSource);
    for (let i = 0; i < 3; i++) {
      doc
        .querySelector(".block p")!
        .append(doc.createComment("unrelated mutation"));
      await settle();
    }
    assert.equal(f.state.bodyCalls, 2);
    const restoredScript = doc.createElement("script");
    restoredScript.src = src;
    doc.head.append(restoredScript);
    doc.querySelector(".block")!.outerHTML = observerSource;
    await flushPage();
    assert.equal(f.state.bodyCalls, 3);
    assert.match(doc.querySelector(".block")!.textContent!, /Translated body/);
    f.click("원문 보기");
    await flushPage();
    assert.equal(doc.querySelector(".block")!.outerHTML, observerSource);
    assert.equal(f.state.catalogs, 1);
  } finally {
    f.close();
  }
});

test("temporary MathJax staging mutations never look like site statement replacement", async () => {
  const f = observerFixture("mathjax");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await f.start();
    const doc = f.dom.window.document;
    const requests = [...f.state.requests];
    const staging = doc.createElement("div");
    staging.hidden = true;
    staging.setAttribute("inert", "");
    staging.dataset.yukicoderKoRenderStaging = "";
    staging.innerHTML =
      '<h3>Rendering title</h3><div class="block"><mjx-container>rendering formula</mjx-container></div>';
    doc.querySelector("#content")!.append(staging);
    await flushPage();
    staging.querySelector("mjx-container")!.append(doc.createElement("span"));
    await flushPage();
    assert.equal(f.state.bodyCalls, 1);
    f.state.beforeTranslate = () => gate;
    doc.querySelector("#content > .block")!.outerHTML = observerSource;
    await flushPage();
    assert.equal(f.state.bodyCalls, 2);
    staging.replaceChildren(doc.createElement("div"));
    await flushPage();
    assert.equal(f.state.bodyCalls, 2);
    staging.remove();
    release();
    await flushPage();
    assert.equal(f.state.bodyCalls, 2);
    assert.deepEqual(f.state.requests, requests);
    assert.match(
      doc.querySelector("#content > .block")!.textContent!,
      /Translated body/,
    );
    assert.equal(doc.querySelector("[data-yukicoder-ko-render-staging]"), null);
  } finally {
    release();
    f.close();
  }
});

test("a site rebuild during initial asynchronous preparation recovers without another download", async () => {
  const f = observerFixture("mathjax");
  try {
    const doc = f.dom.window.document;
    const importNode = doc.importNode.bind(doc);
    let replaced = false;
    doc.importNode = ((node: Node, deep?: boolean) => {
      const imported = importNode(node, deep);
      if (
        !replaced &&
        node.nodeType === 1 &&
        (node as Element).tagName === "H3"
      ) {
        replaced = true;
        doc.querySelector("#content")!.outerHTML = observerContent;
      }
      return imported;
    }) as typeof doc.importNode;
    await f.start();
    assert.ok(replaced);
    assert.equal(f.state.bodyCalls, 2);
    assert.match(
      doc.querySelector("#content > .block")!.textContent!,
      /Translated body/,
    );
    assert.equal(
      f.state.requests.filter((path) => path.includes("translations.test"))
        .length,
      1,
    );
    assert.equal(
      f.state.requests.filter((path) => path.includes("/api/")).length,
      2,
    );
    assert.equal(f.state.catalogs, 1);
    await flushPage();
    assert.equal(f.state.bodyCalls, 2);
    f.click("원문 보기");
    await flushPage();
    assert.equal(
      doc.querySelector("#content > .block")!.outerHTML,
      observerSource,
    );
  } finally {
    f.close();
  }
});

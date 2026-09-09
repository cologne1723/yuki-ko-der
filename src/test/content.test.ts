import assert from "node:assert/strict";
import test from "node:test";
import { bundle, page, settle } from "./extension-fixture.ts";

const titles = [
  { problemNo: 1, problemId: 18, source: "題名", target: "제목" },
];
const code = await bundle("src/content.ts", titles);
test("dynamic contest problem options translate titles and preserve selection, values and restoration", async () => {
  const { dom, close } = page('<body><main id="content"></main></body>');
  let changed!: Change;
  Object.assign(dom.window, {
    yukicoderProblemTranslations: {
      restoreProblem() {},
      translateProblem: async () => ({ status: "applied" }),
    },
    chrome: {
      runtime: {
        getURL: (p: string) => p,
        sendMessage: async () => statusCatalog("제목"),
      },
      storage: {
        local: { get: async () => ({}) },
        onChanged: {
          addListener: (fn: Change) => {
            changed = fn;
          },
        },
      },
    },
    fetch: async () => Response.json({ translations: [] }),
  });
  try {
    dom.window.eval(code);
    await settle();
    const select = dom.window.document.createElement("select");
    select.id = "contest-problem-selector";
    select.innerHTML =
      '<option value="18" selected>✅ A. No.1 題名</option><option value="18">⏳ B. ID 18 題名</option><option value="18">❌ C. No.2 題名</option><option value="99">D. No.1 題名</option>';
    dom.window.document.querySelector("#content")!.append(select);
    await settle();
    assert.deepEqual(
      [...select.options].map((o) => o.textContent),
      [
        "✅ A. No.1 제목",
        "⏳ B. ID 18 제목",
        "❌ C. No.2 題名",
        "D. No.1 題名",
      ],
    );
    assert.equal(select.value, "18");
    assert.equal(select.selectedIndex, 0);
    changed({ translationEnabled: { newValue: false } }, "local");
    await settle();
    assert.equal(select.options[0].textContent, "✅ A. No.1 題名");
    assert.equal(select.options[1].textContent, "⏳ B. ID 18 題名");
    assert.equal(select.selectedIndex, 0);
  } finally {
    close();
  }
});
const statusCatalog = (target: string) => ({
  ok: true,
  source: "remote",
  catalog: {
    schemaVersion: 1,
    revision: "a".repeat(64),
    entries: [{ ...titles[0], target, htmlSha256: "b".repeat(64) }],
  },
});
type Change = (
  changes: Record<string, { newValue: unknown }>,
  area: string,
) => void;

for (const failWhileDisabled of [false, true]) {
  test(`UI loading failure ${failWhileDisabled ? "while disabled" : "after re-enabling"} keeps an active retry and recovers`, async () => {
    const { dom, close } = page(
      '<span id="ui">source</span>',
      "https://yukicoder.me/",
    );
    let changed!: Change;
    let reject!: (error: Error) => void;
    const pending = new Promise<Response>((_, fail) => {
      reject = fail;
    });
    let failed = true;
    let fetches = 0;
    Object.assign(dom.window, {
      chrome: {
        runtime: { getURL: (path: string) => path },
        storage: {
          local: { get: async () => ({}) },
          onChanged: {
            addListener: (listener: Change) => {
              changed = listener;
            },
          },
        },
      },
      fetch: () => {
        fetches++;
        return failed
          ? pending
          : Promise.resolve(
              Response.json({
                translations: [
                  { selector: "#ui", source: "source", target: "target" },
                ],
              }),
            );
      },
    });
    try {
      dom.window.eval(code);
      await settle();
      const initialFetches = fetches;
      changed({ translationEnabled: { newValue: false } }, "local");
      if (failWhileDisabled) {
        reject(new Error("dictionary unavailable"));
        await settle();
        assert.equal(
          dom.window.document.querySelector("#yukicoder-ko-status"),
          null,
        );
      }
      changed({ translationEnabled: { newValue: true } }, "local");
      if (!failWhileDisabled) {
        await settle();
        assert.equal(fetches, initialFetches);
        reject(new Error("dictionary unavailable"));
      }
      await settle();
      const notice = dom.window.document.querySelector("#yukicoder-ko-status");
      assert.match(
        notice?.textContent ?? "",
        /화면 번역을 불러오지 못했습니다/,
      );
      const retry = notice!.querySelector("button")!;
      assert.equal(retry.textContent, "다시 시도");
      failed = false;
      retry.click();
      await settle();
      assert.equal(
        dom.window.document.querySelector("#ui")!.textContent,
        "target",
      );
      assert.equal(
        dom.window.document.querySelector("#yukicoder-ko-status"),
        null,
      );
      assert.ok(fetches > initialFetches);
    } finally {
      close();
    }
  });
}

test("published titles apply before body verification even when UI loading fails, and disabling restores them", async () => {
  const { dom, close } = page(
    '<title>No.1 題名 - yukicoder</title><body><a href="/problems/no/1">No.1 題名</a></body>',
  );
  let changed!: Change;
  let finish!: (value: unknown) => void;
  let bodyCalls = 0;
  Object.assign(dom.window, {
    chrome: {
      runtime: {
        getURL: (p: string) => p,
        sendMessage: async () => statusCatalog("새 제목"),
      },
      storage: {
        local: { get: async () => ({}) },
        onChanged: {
          addListener: (fn: Change) => {
            changed = fn;
          },
        },
      },
    },
    fetch: async () => {
      throw new Error("dictionary unavailable");
    },
    yukicoderProblemTranslations: {
      restoreProblem() {},
      translateProblem: () => {
        bodyCalls++;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    },
  });
  try {
    dom.window.eval(code);
    await settle();
    assert.equal(
      dom.window.document.querySelector("a")!.textContent,
      "No.1 새 제목",
    );
    assert.equal(dom.window.document.title, "No.1 새 제목 - yukicoder");
    assert.equal(bodyCalls, 1);
    assert.match(
      dom.window.document.querySelector("#yukicoder-ko-status")!.textContent!,
      /화면 번역/,
    );
    changed({ translationEnabled: { newValue: false } }, "local");
    finish({ status: "applied" });
    await settle();
    assert.equal(
      dom.window.document.querySelector("a")!.textContent,
      "No.1 題名",
    );
    assert.equal(
      dom.window.document.querySelector("#yukicoder-ko-status"),
      null,
    );
  } finally {
    close();
  }
});

test("settings failure preserves Japanese, offers retry, and cannot overwrite a newer toggle", async () => {
  const { dom, close } = page(
    '<body><a href="/problems/no/1">No.1 題名</a></body>',
  );
  let fail = true;
  let changed!: Change;
  Object.assign(dom.window, {
    yukicoderProblemTranslations: {
      restoreProblem() {},
      translateProblem: async () => ({ status: "applied" }),
    },
    chrome: {
      runtime: { getURL: (p: string) => p },
      storage: {
        local: {
          get: async () => {
            if (fail) throw new Error("unavailable");
            return {};
          },
        },
        onChanged: {
          addListener: (fn: Change) => {
            changed = fn;
          },
        },
      },
    },
    fetch: async () => Response.json({ translations: [] }),
  });
  try {
    dom.window.eval(code);
    await settle();
    assert.equal(
      dom.window.document.querySelector("a")!.textContent,
      "No.1 題名",
    );
    assert.match(
      dom.window.document.querySelector("#yukicoder-ko-status")!.textContent!,
      /번역 설정/,
    );
    fail = false;
    (
      dom.window.document.querySelector(
        "#yukicoder-ko-status button",
      ) as HTMLButtonElement
    ).click();
    changed({ translationEnabled: { newValue: false } }, "local");
    await settle();
    assert.equal(
      dom.window.document.querySelector("a")!.textContent,
      "No.1 題名",
    );
    changed({ translationEnabled: { newValue: true } }, "local");
    await settle();
    assert.equal(
      dom.window.document.querySelector("a")!.textContent,
      "No.1 제목",
    );
  } finally {
    close();
  }
});

test("page-load catalog removals override bundled titles and verification failures have a brief notice", async () => {
  const { dom, close } = page(
    '<body><div id="content"><h3>No.1 題名</h3><a href="/problems/no/1">題名</a></div></body>',
  );
  Object.assign(dom.window, {
    chrome: {
      runtime: {
        getURL: (p: string) => p,
        sendMessage: async () => ({
          ...statusCatalog("unused"),
          catalog: { ...statusCatalog("unused").catalog, entries: [] },
        }),
      },
    },
    fetch: async () => Response.json({ translations: [] }),
    yukicoderProblemTranslations: {
      restoreProblem() {},
      translateProblem: async () => ({
        status: "failed",
        reason: "verification",
        detail: "Sample changed",
      }),
    },
  });
  try {
    dom.window.eval(code);
    await settle();
    assert.equal(dom.window.document.querySelector("a")!.textContent, "題名");
    const notice = dom.window.document.querySelector("#yukicoder-ko-status")!;
    assert.match(notice.textContent!, /원문을 표시/);
    assert.equal(notice.querySelector("button"), null);
    assert.doesNotMatch(notice.textContent!, /Sample changed/);
  } finally {
    close();
  }
});

test("back-forward restoration rechecks settings and published titles without translating while suspended", async () => {
  const { dom, close } = page(
    '<body><a href="/problems/no/1">No.1 題名</a></body>',
  );
  let title = "첫 제목";
  let fail = false;
  Object.assign(dom.window, {
    yukicoderProblemTranslations: {
      restoreProblem() {},
      translateProblem: async () => ({ status: "applied" }),
    },
    chrome: {
      runtime: {
        getURL: (p: string) => p,
        sendMessage: async () => statusCatalog(title),
      },
      storage: {
        local: {
          get: async () => {
            if (fail) throw new Error("Settings unavailable");
            return {};
          },
        },
      },
    },
    fetch: async () => Response.json({ translations: [] }),
  });
  try {
    dom.window.eval(code);
    await settle();
    assert.equal(
      dom.window.document.querySelector("a")!.textContent,
      "No.1 첫 제목",
    );
    dom.window.dispatchEvent(
      new dom.window.PageTransitionEvent("pagehide", { persisted: true }),
    );
    const added = dom.window.document.createElement("a");
    added.href = "/problems/no/1";
    added.textContent = "題名";
    dom.window.document.body.append(added);
    await settle();
    assert.equal(added.textContent, "題名");
    title = "갱신한 제목";
    fail = true;
    dom.window.dispatchEvent(
      new dom.window.PageTransitionEvent("pageshow", { persisted: true }),
    );
    await settle();
    assert.equal(
      dom.window.document.querySelector("a")!.textContent,
      "No.1 題名",
    );
    assert.equal(added.textContent, "題名");
    fail = false;
    (
      dom.window.document.querySelector(
        "#yukicoder-ko-status button",
      ) as HTMLButtonElement
    ).click();
    await settle();
    assert.equal(
      dom.window.document.querySelector("a")!.textContent,
      "No.1 갱신한 제목",
    );
    assert.equal(added.textContent, "갱신한 제목");
  } finally {
    close();
  }
});

test("problem loading and background verification keep an original action and ignore late results after restoration", async () => {
  const { dom, close } = page(
    '<body><main id="content"><h3>No.1 題名</h3><p id="body">Japanese</p></main></body>',
  );
  let finishLoad!: (value: unknown) => void;
  let finishVerification!: (value: unknown) => void;
  const verification = new Promise((resolve) => {
    finishVerification = resolve;
  });
  Object.assign(dom.window, {
    chrome: {
      runtime: {
        getURL: (p: string) => p,
        sendMessage: async () => statusCatalog("제목"),
      },
      storage: {
        local: { get: async () => ({}) },
        onChanged: { addListener() {} },
      },
    },
    fetch: async () => Response.json({ translations: [] }),
    yukicoderProblemTranslations: {
      restoreProblem() {
        dom.window.document.querySelector("#body")!.textContent = "Japanese";
      },
      translateProblem: () =>
        new Promise((resolve) => {
          finishLoad = resolve;
        }),
    },
  });
  try {
    dom.window.eval(code);
    await settle();
    const status = () =>
      dom.window.document.querySelector("#yukicoder-ko-status")!;
    assert.match(status().textContent!, /불러오고 있습니다/);
    const original = () =>
      [...status().querySelectorAll("button")].find(
        (b) => b.textContent === "원문 보기",
      )!;
    assert.ok(original());
    dom.window.document.querySelector("#body")!.textContent = "Korean";
    finishLoad({ status: "applied", verification });
    await settle();
    assert.equal(status().firstChild?.textContent, "한국어 번역본 입니다.");
    assert.equal(
      dom.window.document.querySelector("#body")!.textContent,
      "Korean",
    );
    original().click();
    finishVerification({ status: "changed" });
    await settle();
    assert.equal(
      dom.window.document.querySelector("#body")!.textContent,
      "Japanese",
    );
    assert.equal(status().firstChild?.textContent, "일본어 원문입니다");
    assert.doesNotMatch(status().textContent!, /달라졌습니다/);
    const korean = status().querySelector("button")!;
    assert.equal(korean.textContent, "한국어 번역 보기");
    korean.click();
    await settle();
    dom.window.document.querySelector("#body")!.textContent = "Korean";
    finishLoad({ status: "applied" });
    await settle();
    assert.equal(status().firstChild?.textContent, "한국어 번역본 입니다.");
    assert.equal(
      dom.window.document.querySelector("#body")!.textContent,
      "Korean",
    );
    original().click();
    assert.equal(status().firstChild?.textContent, "일본어 원문입니다");
    assert.equal(
      dom.window.document.querySelector("#body")!.textContent,
      "Japanese",
    );
  } finally {
    close();
  }
});

for (const verificationStatus of ["verified", "changed", "unavailable"]) {
  test(`background ${verificationStatus} result keeps original access`, async () => {
    const { dom, close } = page(
      '<body><main id="content"><h3>No.1 題名</h3></main></body>',
    );
    Object.assign(dom.window, {
      chrome: {
        runtime: {
          getURL: (p: string) => p,
          sendMessage: async () => statusCatalog("제목"),
        },
        storage: {
          local: { get: async () => ({}) },
          onChanged: { addListener() {} },
        },
      },
      fetch: async () => Response.json({ translations: [] }),
      yukicoderProblemTranslations: {
        restoreProblem() {},
        translateProblem: async () => ({
          status: "applied",
          verification: Promise.resolve({ status: verificationStatus }),
        }),
      },
    });
    try {
      dom.window.eval(code);
      await settle();
      const notice = dom.window.document.querySelector("#yukicoder-ko-status")!;
      assert.ok(
        [...notice.querySelectorAll("button")].some(
          (b) => b.textContent === "원문 보기",
        ),
      );
      assert.doesNotMatch(
        notice.textContent!,
        /불러오고 있습니다|확인하고 있습니다/,
      );
      assert.equal(notice.nextElementSibling?.tagName, "H3");
      if (verificationStatus === "verified")
        assert.equal(
          (notice.querySelector("button") as HTMLButtonElement).style
            .marginInlineStart,
          "0.5em",
        );
      if (verificationStatus === "changed")
        assert.match(notice.textContent!, /번역 시점과 문제가 달라졌습니다/);
      if (verificationStatus === "unavailable")
        assert.match(notice.textContent!, /확인하지 못했습니다/);
    } finally {
      close();
    }
  });
}

for (const path of [
  "/problems/no/1/submissions",
  "/problems/18/submissions",
  "/submissions",
]) {
  test(`non-statement page ${path} translates titles without problem notices or body requests`, async () => {
    const { dom, close } = page(
      '<body><main id="content"><h3>提出一覧</h3><a href="/problems/no/1">No.1 題名</a></main></body>',
      `https://yukicoder.me${path}`,
    );
    let bodyCalls = 0;
    Object.assign(dom.window, {
      chrome: {
        runtime: {
          getURL: (p: string) => p,
          sendMessage: async () => statusCatalog("제목"),
        },
        storage: {
          local: { get: async () => ({}) },
          onChanged: { addListener() {} },
        },
      },
      fetch: async () => Response.json({ translations: [] }),
      yukicoderProblemTranslations: {
        restoreProblem() {},
        translateProblem: async () => {
          bodyCalls++;
          return { status: "unavailable" };
        },
      },
    });
    try {
      dom.window.eval(code);
      await settle();
      assert.equal(bodyCalls, 0);
      assert.equal(
        dom.window.document.querySelector("#yukicoder-ko-status"),
        null,
      );
      assert.equal(
        dom.window.document.querySelector("a")!.textContent,
        "No.1 제목",
      );
    } finally {
      close();
    }
  });
}

test("editorial titles translate only the matching problem and restore on disable", async () => {
  const { dom, close } = page(
    '<title>解説 No.1 題名 - yukicoder</title><main id="content"><h3>No.1 題名 解説</h3></main>',
    "https://yukicoder.me/problems/no/1/editorial",
  );
  let changed!: Change;
  Object.assign(dom.window, {
    chrome: {
      runtime: {
        getURL: (p: string) => p,
        sendMessage: async () => statusCatalog("제목"),
      },
      storage: {
        local: { get: async () => ({}) },
        onChanged: {
          addListener(fn: Change) {
            changed = fn;
          },
        },
      },
    },
    fetch: async () => Response.json({ translations: [] }),
  });
  try {
    dom.window.eval(code);
    await settle();
    assert.equal(dom.window.document.title, "해설 No.1 제목 - yukicoder");
    assert.equal(
      dom.window.document.querySelector("h3")!.textContent,
      "No.1 제목 해설",
    );
    assert.equal(
      dom.window.document.querySelector("#yukicoder-ko-status"),
      null,
    );
    changed({ translationEnabled: { newValue: false } }, "local");
    await settle();
    assert.equal(dom.window.document.title, "解説 No.1 題名 - yukicoder");
    assert.equal(
      dom.window.document.querySelector("h3")!.textContent,
      "No.1 題名 解説",
    );
  } finally {
    close();
  }
});

test("translation writes do not feed the observer, including unchanged contest titles", async () => {
  const { dom, close } = page(
    '<body><main id="content"><select id="contest-problem-selector"><option value="18">A. No.1 題名</option></select><a href="/problems/no/1">題名</a></main></body>',
  );
  const NativeObserver = dom.window.MutationObserver;
  let callbacks = 0;
  // Bound the old feedback loop so a regression fails instead of hanging tests.
  class CountingObserver extends NativeObserver {
    constructor(callback: MutationCallback) {
      super((records, observer) => {
        callbacks++;
        if (callbacks > 20) observer.disconnect();
        else callback(records, observer);
      });
    }
  }
  Object.assign(dom.window, {
    MutationObserver: CountingObserver,
    chrome: {
      runtime: {
        getURL: (p: string) => p,
        sendMessage: async () => statusCatalog("題名"),
      },
      storage: { local: { get: async () => ({}) } },
    },
    fetch: async () => Response.json({ translations: [] }),
  });
  const flush = () => new Promise((resolve) => setTimeout(resolve, 30));
  try {
    dom.window.eval(code);
    await flush();
    assert.equal(
      callbacks,
      0,
      "initial translations must not observe themselves",
    );
    const added = dom.window.document.createElement("p");
    added.textContent = "site update";
    dom.window.document.querySelector("main")!.append(added);
    await flush();
    assert.equal(
      callbacks,
      1,
      "one site mutation must settle after one callback",
    );
    await flush();
    assert.equal(callbacks, 1, "idle pages must not keep rescanning");
  } finally {
    close();
  }
});

test("actual text and attribute translations do not observe their own writes or unrelated styles", async () => {
  const { dom, close } = page(
    '<main id="content"><p title="source">source</p><a href="/problems/no/1">題名</a></main>',
  );
  const NativeObserver = dom.window.MutationObserver;
  let callbacks = 0;
  Object.assign(dom.window, {
    yukicoderProblemTranslations: {
      restoreProblem() {},
      translateProblem: async () => ({ status: "applied" }),
    },
    MutationObserver: class extends NativeObserver {
      constructor(callback: MutationCallback) {
        super((records, observer) => {
          callbacks++;
          if (callbacks > 20) observer.disconnect();
          else callback(records, observer);
        });
      }
    },
    chrome: {
      runtime: {
        getURL: (p: string) => p,
        sendMessage: async () => statusCatalog("제목"),
      },
      storage: { local: { get: async () => ({}) } },
    },
    fetch: async () =>
      Response.json({
        translations: [
          { selector: "#content p", source: "source", target: "target" },
          {
            selector: "#content p",
            attribute: "title",
            source: "source",
            target: "attribute",
          },
        ],
      }),
  });
  try {
    dom.window.eval(code);
    await settle();
    const p = dom.window.document.querySelector("#content p[title]")!;
    assert.equal(p.textContent, "target");
    assert.equal(p.getAttribute("title"), "attribute");
    assert.equal(dom.window.document.querySelector("a")!.textContent, "제목");
    assert.equal(callbacks, 0);
    p.firstChild!.nodeValue = "source";
    p.setAttribute("title", "source");
    await settle();
    assert.equal(p.textContent, "target");
    assert.equal(p.getAttribute("title"), "attribute");
    assert.equal(callbacks, 1);
    for (let i = 0; i < 10; i++) {
      p.setAttribute("style", `opacity:${i / 10}`);
      await settle();
    }
    assert.equal(callbacks, 1);
  } finally {
    close();
  }
});

test("late Noty announcements and errors translate through the real shared catalog while preserving controls and payloads", async () => {
  const { readFile } = await import("node:fs/promises");
  const { dom, close } = page(
    '<main id="content"><pre>コンテストが終了しました。</pre></main>',
    "https://yukicoder.me/problems/no/123",
  );
  let changed!: Change;
  Object.assign(dom.window, {
    chrome: {
      runtime: { getURL: (path: string) => path },
      storage: {
        local: { get: async () => ({}) },
        onChanged: {
          addListener: (fn: Change) => {
            changed = fn;
          },
        },
      },
    },
    fetch: async (path: string) =>
      Response.json(JSON.parse(await readFile(path, "utf8"))),
  });
  try {
    dom.window.eval(code);
    // Wait for the local dictionary reads, not just the observer's timer.
    for (let i = 0; i < 20; i++) await settle();
    const doc = dom.window.document;
    const container = doc.createElement("div");
    container.id = "noty_layout__top";
    doc.body.append(container);
    const cases = [
      ["コンテストが終了しました。", "대회가 종료되었습니다."],
      [
        "入力をクリップボードにコピーしました",
        "입력을 클립보드에 복사했습니다",
      ],
      [
        'JSONに "subtasks" 配列が必要です',
        'JSON에 "subtasks" 배열이 필요합니다',
      ],
      [
        "配点の合計が87.5%です。合計100%にしてください",
        "배점 합계가 87.5%입니다. 합계를 100%로 맞춰 주세요",
      ],
      ["HTTPエラー: 403", "HTTP 오류: 403"],
    ];
    let copies = 0;
    const notifications: Element[] = [];
    for (const [source, target] of cases) {
      const notification = doc.createElement("div");
      notification.className = "noty_body";
      const button = doc.createElement("button");
      button.className = "noty-copy-btn";
      button.title = "コピー";
      button.addEventListener("click", () => copies++);
      const message = doc.createTextNode(source);
      const link = doc.createElement("a");
      link.href = "/submissions/123";
      link.textContent = "#123";
      notification.append(button, message, link);
      container.append(notification);
      await settle();
      assert.equal(message.nodeValue, target);
      assert.equal(notification.firstChild, button);
      assert.equal(notification.lastChild, link);
      assert.equal(link.getAttribute("href"), "/submissions/123");
      assert.equal(link.textContent, "#123");
      assert.equal(button.title, "복사");
      button.click();
      notifications.push(notification);
    }
    assert.equal(copies, cases.length);
    assert.equal(doc.querySelector("pre")!.textContent, cases[0][0]);
    changed({ translationEnabled: { newValue: false } }, "local");
    await settle();
    notifications.forEach((element, i) => {
      assert.equal(element.childNodes[1].nodeValue, cases[i][0]);
      assert.equal(element.querySelector("button")!.title, "コピー");
    });
    changed({ translationEnabled: { newValue: true } }, "local");
    await settle();
    notifications.forEach((element, i) =>
      assert.equal(element.childNodes[1].nodeValue, cases[i][1]),
    );
  } finally {
    close();
  }
});

for (const state of [
  "unavailable",
  "network",
  "verification",
  "throw",
  "cancelled",
]) {
  test(`unapplied problem ${state} removes redundant original action`, async () => {
    const { dom, close } = page(
      '<main id="content"><h3>No.1 題名</h3><nav><a href="/problems/no/1">No.1 題名</a></nav><p id="original-body">Japanese</p></main>',
    );
    Object.assign(dom.window, {
      chrome: {
        runtime: {
          getURL: (p: string) => p,
          sendMessage: async () => statusCatalog("제목"),
        },
        storage: { local: { get: async () => ({}) } },
      },
      fetch: async () => Response.json({ translations: [] }),
      yukicoderProblemTranslations: {
        restoreProblem() {},
        translateProblem: async () => {
          if (state === "throw") throw new Error("Load failed");
          return state === "network" || state === "verification"
            ? { status: "failed", reason: state }
            : { status: state };
        },
      },
    });
    try {
      dom.window.eval(code);
      await settle();
      const notice = dom.window.document.querySelector("#yukicoder-ko-status");
      const buttons = [...(notice?.querySelectorAll("button") ?? [])];
      assert.ok(buttons.every((b) => b.textContent !== "원문 보기"));
      assert.equal(
        buttons.length,
        state === "network" || state === "throw" ? 1 : 0,
      );
      assert.doesNotMatch(notice?.textContent ?? "", /불러오고 있습니다/);
      if (state === "unavailable")
        assert.match(notice!.textContent!, /번역이 없어 원문을 표시/);
      if (state === "cancelled") assert.equal(notice, null);
      assert.equal(
        dom.window.document.querySelector("nav a")!.textContent,
        "No.1 제목",
      );
      assert.equal(
        dom.window.document.querySelector("h3")!.textContent,
        "No.1 題名",
      );
      dom.window.document.querySelector("h3")!.append(" ");
      await settle();
      assert.equal(
        dom.window.document.querySelector("h3")!.textContent,
        "No.1 題名 ",
      );
      assert.equal(
        dom.window.document.querySelector("#original-body")!.textContent,
        "Japanese",
      );
    } finally {
      close();
    }
  });
}

for (const delayed of ["dictionary", "catalog"]) {
  test(`original selection preserves pending UI translation with delayed ${delayed}`, async () => {
    const { dom, close } = page(
      '<main id="content"><h3>No.1 題名</h3><a id="ui">source</a></main>',
    );
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let bodyCalls = 0;
    Object.assign(dom.window, {
      chrome: {
        runtime: {
          getURL: (p: string) => p,
          sendMessage: async () => {
            if (delayed === "catalog") await gate;
            return statusCatalog("제목");
          },
        },
        storage: { local: { get: async () => ({}) } },
      },
      fetch: async () => {
        await gate;
        return Response.json({
          translations: [
            { selector: "#ui", source: "source", target: "target" },
          ],
        });
      },
      yukicoderProblemTranslations: {
        restoreProblem() {},
        translateProblem: async () => {
          bodyCalls++;
          await gate;
          return { status: "unavailable" };
        },
      },
    });
    try {
      dom.window.eval(code);
      await settle();
      dom.window.document
        .querySelector<HTMLButtonElement>("#yukicoder-ko-status button")!
        .click();
      release();
      await settle();
      assert.equal(
        dom.window.document.querySelector("#ui")!.textContent,
        "target",
      );
      assert.equal(
        dom.window.document.querySelector("h3")!.textContent,
        "No.1 題名",
      );
      assert.match(
        dom.window.document.querySelector("#yukicoder-ko-status")!.textContent!,
        /일본어 원문입니다/,
      );
      if (delayed === "catalog") assert.equal(bodyCalls, 0);
    } finally {
      close();
    }
  });
}

for (const original of [false, true]) {
  test(`UI-only retry preserves ${original ? "original" : "translated"} problem and does not refetch it`, async () => {
    const { dom, close } = page(
      '<title>No.1 題名 - yukicoder</title><main id="content"><h3>No.1 題名</h3><nav><a href="/problems/no/1">No.1 題名</a></nav><span id="ui">source</span></main>',
    );
    let failed = true;
    let bodyCalls = 0;
    let catalogs = 0;
    Object.assign(dom.window, {
      chrome: {
        runtime: {
          getURL: (p: string) => p,
          sendMessage: async () => {
            catalogs++;
            return statusCatalog("제목");
          },
        },
        storage: { local: { get: async () => ({}) } },
      },
      fetch: async () => {
        if (failed) throw new Error("UI unavailable");
        return Response.json({
          translations: [
            { selector: "#ui", source: "source", target: "target" },
          ],
        });
      },
      yukicoderProblemTranslations: {
        restoreProblem() {},
        translateProblem: async () => {
          bodyCalls++;
          return { status: "applied" };
        },
      },
    });
    try {
      dom.window.eval(code);
      await settle();
      const doc = dom.window.document;
      const notice = () => doc.querySelector("#yukicoder-ko-status")!;
      if (original)
        [...notice().querySelectorAll("button")]
          .find((b) => b.textContent === "원문 보기")!
          .click();
      failed = false;
      [...notice().querySelectorAll("button")]
        .find((b) => b.textContent === "다시 시도")!
        .click();
      await settle();
      assert.equal(doc.querySelector("#ui")!.textContent, "target");
      assert.equal(bodyCalls, 1);
      assert.equal(catalogs, 1);
      assert.equal(
        notice().firstChild!.textContent,
        original ? "일본어 원문입니다" : "한국어 번역본 입니다.",
      );
      assert.equal(
        notice().querySelector("button")!.textContent,
        original ? "한국어 번역 보기" : "원문 보기",
      );
      assert.equal(doc.querySelector("nav a")!.textContent, "No.1 제목");
      assert.equal(
        doc.querySelector("h3")!.textContent,
        original ? "No.1 題名" : "No.1 제목",
      );
      assert.equal(
        doc.title,
        original ? "No.1 題名 - yukicoder" : "No.1 제목 - yukicoder",
      );
    } finally {
      close();
    }
  });
}

import assert from "node:assert/strict";
import test from "node:test";
import { bundle, page, settle } from "./extension-fixture.ts";

const titles = [
  { problemNo: 1, problemId: 18, source: "題名", target: "제목" },
];
const code = await bundle("src/content.ts", titles);
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
    assert.equal(notice.querySelector("button")?.textContent, "원문 보기");
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
    assert.match(status().textContent!, /변경 여부를 확인/);
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
    assert.match(status().textContent!, /원문을 표시/);
    assert.doesNotMatch(status().textContent!, /달라졌습니다/);
    assert.ok(original());
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
          "",
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

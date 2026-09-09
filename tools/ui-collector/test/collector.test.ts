import cssEscape from "css.escape";
import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { CollectorController } from "../src/collector.ts";
import { IndexedDbStore } from "../src/storage.ts";
import "fake-indexeddb/auto";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

for (const resume of [false, true]) {
  test(`deleting during ${resume ? "resume" : "creation"} drains startup and permits a new session`, async (context) => {
    const dom = new JSDOM("<button>日本語</button>", {
      url: "https://yukicoder.me/",
    });
    Object.assign(globalThis, {
      window: dom.window,
      location: dom.window.location,
      Element: dom.window.Element,
      Document: dom.window.Document,
      HTMLButtonElement: dom.window.HTMLButtonElement,
      NodeFilter: dom.window.NodeFilter,
      CSS: { escape: cssEscape },
      MutationObserver: dom.window.MutationObserver,
    });
    const store = new IndexedDbStore(`delete-start-${crypto.randomUUID()}`);
    let controller = new CollectorController(dom.window.document, { store });
    let id: string | undefined;
    if (resume) {
      id = (await controller.start()).sessionId;
      await controller.pause();
      controller = new CollectorController(dom.window.document, { store });
    }
    const entered = deferred(),
      release = deferred();
    let held = false;
    const hold = async () => {
      if (held) return;
      held = true;
      entered.resolve();
      await release.promise;
    };
    if (resume) {
      const get = store.getSession.bind(store);
      context.mock.method(store, "getSession", async (key: string) => {
        const session = await get(key);
        await hold();
        return session;
      });
    } else {
      const create = store.createSession.bind(store);
      context.mock.method(
        store,
        "createSession",
        async (session: Parameters<typeof create>[0]) => {
          await create(session);
          id = session.sessionId;
          await hold();
        },
      );
    }
    try {
      const started = controller.start(id);
      await entered.promise;
      const deletedId = id!;
      let acknowledged = false;
      const deletion = controller.discardSession(deletedId).then(async () => {
        acknowledged = true;
        await store.deleteSession(deletedId);
      });
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(acknowledged, false);
      release.resolve();
      await Promise.all([started, deletion]);
      assert.equal(controller.sessionId, undefined);
      assert.equal(controller.recording, false);
      assert.equal(await store.getSession(deletedId), undefined);
      const next = await controller.start();
      assert.notEqual(next.sessionId, deletedId);
      assert.equal(controller.recording, true);
    } finally {
      release.resolve();
      await controller.pause();
      dom.window.close();
    }
  });
}

for (const resume of [false, true]) {
  test(`pause during ${resume ? "navigation resume" : "initial creation"} prevents late recording and permits an explicit restart`, async (context) => {
    const dom = new JSDOM("<button>日本語</button>", {
      url: "https://yukicoder.me/",
    });
    Object.assign(globalThis, {
      window: dom.window,
      location: dom.window.location,
      Element: dom.window.Element,
      Document: dom.window.Document,
      HTMLButtonElement: dom.window.HTMLButtonElement,
      NodeFilter: dom.window.NodeFilter,
      CSS: { escape: cssEscape },
      MutationObserver: dom.window.MutationObserver,
    });
    const store = new IndexedDbStore(`pause-start-${crypto.randomUUID()}`);
    let controller = new CollectorController(dom.window.document, { store });
    let resumeId: string | undefined;
    if (resume) {
      resumeId = (await controller.start()).sessionId;
      await controller.pause();
      controller = new CollectorController(dom.window.document, { store });
    }
    const entered = deferred();
    const release = deferred();
    let first = true;
    const hold = async () => {
      if (!first) return;
      first = false;
      entered.resolve();
      await release.promise;
    };
    if (resume) {
      const get = store.getSession.bind(store);
      context.mock.method(store, "getSession", async (id: string) => {
        await hold();
        return get(id);
      });
    } else {
      const create = store.createSession.bind(store);
      context.mock.method(
        store,
        "createSession",
        async (session: Parameters<typeof create>[0]) => {
          await hold();
          return create(session);
        },
      );
    }
    try {
      const started = controller.start(resumeId);
      await entered.promise;
      await controller.pause();
      assert.equal(controller.recording, false);
      release.resolve();
      const session = await started;
      assert.equal(controller.recording, false);
      assert.equal(
        (await store.getSession(session.sessionId))?.status,
        "paused",
      );
      assert.equal(
        (await store.bundle(session.sessionId)).captures.length,
        resume ? 1 : 0,
      );
      await controller.start(session.sessionId);
      assert.equal(controller.recording, true);
      assert.equal(
        (await store.getSession(session.sessionId))?.status,
        "recording",
      );
    } finally {
      release.resolve();
      await controller.pause();
      await store.close();
      dom.window.close();
    }
  });
}

test("coalesces interactions for 250 ms and scans within one second of sustained activity", async (context) => {
  const dom = new JSDOM("<button>日本語</button>", {
    url: "https://yukicoder.me/",
  });
  Object.assign(globalThis, {
    window: dom.window,
    location: dom.window.location,
    Element: dom.window.Element,
    Document: dom.window.Document,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    NodeFilter: dom.window.NodeFilter,
    CSS: { escape: cssEscape },
    Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver,
  });
  context.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  const store = new IndexedDbStore(`collector-debounce-${crypto.randomUUID()}`);
  context.after(() => store.close());
  const controller = new CollectorController(dom.window.document, { store });
  const capture = context.mock.method(
    controller,
    "capture",
    async () => undefined,
  );
  try {
    await controller.start();
    assert.equal(capture.mock.callCount(), 1);
    const click = () => dom.window.document.querySelector("button")!.click();

    click();
    context.mock.timers.tick(249);
    assert.equal(capture.mock.callCount(), 1);
    context.mock.timers.tick(1);
    assert.equal(capture.mock.callCount(), 2);
    assert.deepEqual(capture.mock.calls.at(-1)!.arguments, [
      "interaction",
      [dom.window.document.querySelector("button")!],
    ]);

    for (let index = 0; index < 10; index += 1) {
      click();
      context.mock.timers.tick(100);
      assert.equal(capture.mock.callCount(), index === 9 ? 3 : 2);
    }

    const button = dom.window.document.querySelector("button")!;
    button.firstChild!.textContent = "変更後";
    button.setAttribute("aria-label", "実行する");
    await Promise.resolve();
    context.mock.timers.tick(250);
    assert.deepEqual(capture.mock.calls.at(-1)!.arguments, [
      "mutation",
      [button],
    ]);
    button.hidden = true;
    await Promise.resolve();
    context.mock.timers.tick(250);
    assert.deepEqual(capture.mock.calls.at(-1)!.arguments, [
      "mutation",
      [button],
    ]);
    const style = dom.window.document.createElement("style");
    style.textContent = '[aria-label="開く"] ~ aside { display: block }';
    dom.window.document.head.append(style);
    await Promise.resolve();
    context.mock.timers.tick(250);
    button.setAttribute("aria-label", "開く");
    await Promise.resolve();
    context.mock.timers.tick(250);
    assert.deepEqual(
      capture.mock.calls.at(-1)!.arguments,
      ["mutation", [button]],
      "visibility probes account for CSS effects outside the scheduled subtree",
    );
  } finally {
    await controller.pause();
    dom.window.close();
  }
});

for (const manual of [false, true])
  test(
    manual
      ? "queued manual capture survives later mutations even without new observations"
      : "subtree captures keep root labels and queued edits arriving during hashing",
    { timeout: 5000 },
    async (context) => {
      const dom = new JSDOM(
        '<button aria-label="説明"><span>最初</span></button><aside>周囲</aside>',
        {
          url: "https://yukicoder.me/",
        },
      );
      Object.assign(globalThis, {
        window: dom.window,
        location: dom.window.location,
        Element: dom.window.Element,
        Document: dom.window.Document,
        HTMLButtonElement: dom.window.HTMLButtonElement,
        NodeFilter: dom.window.NodeFilter,
        CSS: { escape: cssEscape },
        MutationObserver: dom.window.MutationObserver,
      });
      const store = new IndexedDbStore(`queued-${crypto.randomUUID()}`);
      const controller = new CollectorController(dom.window.document, {
        store,
      });
      const digest = crypto.subtle.digest.bind(crypto.subtle);
      const entered = deferred();
      const release = deferred();
      let first = true;
      context.mock.method(
        crypto.subtle,
        "digest",
        async (...args: Parameters<typeof digest>) => {
          if (first) {
            first = false;
            entered.resolve();
            await release.promise;
          }
          return digest(...args);
        },
      );
      const committed = deferred();
      const commit = store.commitBatch.bind(store);
      let commits = 0;
      context.mock.method(
        store,
        "commitBatch",
        async (...args: Parameters<typeof commit>) => {
          const result = await commit(...args);
          if (++commits === 2) committed.resolve();
          return result;
        },
      );
      try {
        const started = controller.start();
        await entered.promise;
        const button = dom.window.document.querySelector("button")!;
        const span = button.querySelector("span")!;
        const manualResult = manual
          ? await controller.captureManually()
          : undefined;
        if (manual) assert.equal(manualResult?.outcome, "queued");
        if (!manual) {
          span.firstChild!.textContent = "変更後";
          button.setAttribute("aria-label", "変更した説明");
        }
        await controller.capture("mutation", [span]);
        await controller.capture("mutation", [button, span]);
        release.resolve();
        await started;
        await committed.promise;
        await controller.pause();
        const bundle = await store.bundle(controller.sessionId!);
        assert.equal(bundle.captures.length, 2);
        const queued = bundle.captures.find(
          (item) => item.reason === (manual ? "manual" : "mutation"),
        )!;
        assert.ok(queued);
        const later = bundle.occurrences.filter(
          (item) => item.captureId === queued.captureId,
        );
        assert.deepEqual(
          later.map((item) => item.exactText).sort(),
          manual ? [] : ["変更した説明", "変更後", "変更後"].sort(),
        );
        assert.equal(
          new Set(later.map((item) => item.snapshotNodeLocator)).size,
          manual ? 0 : 3,
        );
        assert.equal(bundle.session.captureFailures.length, 0);
        if (manualResult?.outcome === "queued") {
          await new Promise((resolve) => setImmediate(resolve));
          assert.deepEqual(controller.manualCapture, {
            requestId: manualResult.requestId,
            outcome: "saved",
            error: undefined,
          });
        }
      } finally {
        release.resolve();
        await controller.pause();
        await store.close();
        dom.window.close();
      }
    },
  );

test("production captures retain one page state while hashing and export exact locators", async (context) => {
  const dom = new JSDOM(
    '<title>Before</title><h2>操作一覧</h2><button aria-label="実行する">日本語</button><input type="submit" value="送信"><p hidden>非表示</p><p style="opacity:0">透明</p><details><summary>概要</summary><p>閉鎖</p></details>',
    {
      url: "https://yukicoder.me/",
    },
  );
  Object.assign(globalThis, {
    window: dom.window,
    location: dom.window.location,
    Element: dom.window.Element,
    Document: dom.window.Document,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    NodeFilter: dom.window.NodeFilter,
    CSS: { escape: cssEscape },
    MutationObserver: dom.window.MutationObserver,
  });
  dom.window.document.querySelector<HTMLInputElement>("input")!.value =
    "送信する";
  const store = new IndexedDbStore(`capture-${crypto.randomUUID()}`);
  const controller = new CollectorController(dom.window.document, { store });
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  let changed = false;
  context.mock.method(
    crypto.subtle,
    "digest",
    (...args: Parameters<typeof digest>) => {
      if (!changed) {
        changed = true;
        dom.window.document.title = "After";
        dom.window.document.querySelector("h2")!.textContent = "新しい操作";
        dom.window.document.querySelector("button")!.textContent = "変更後";
      }
      return digest(...args);
    },
  );
  try {
    await controller.start();
    await controller.pause();
    const bundle = await store.bundle(controller.sessionId!);
    assert.equal(
      bundle.captures.length,
      1,
      JSON.stringify(bundle.session.captureFailures),
    );
    assert.equal(bundle.captures[0].title, "Before");
    assert.ok(bundle.occurrences.some((o) => o.exactText === "日本語"));
    assert.ok(
      bundle.occurrences
        .find((o) => o.exactText === "送信する")!
        .snapshotNodeLocator.endsWith("/@value"),
    );
    assert.equal(
      bundle.occurrences.find((o) => o.exactText === "日本語")!.nearbyContext,
      "操作一覧",
    );
    assert.ok(
      bundle.occurrences.every(
        (o) => !["変更後", "非表示", "透明", "閉鎖"].includes(o.exactText),
      ),
    );
    const snapshot = new JSDOM(bundle.html[0].html);
    try {
      for (const occurrence of bundle.occurrences) {
        const node = snapshot.window.document.evaluate(
          occurrence.snapshotNodeLocator,
          snapshot.window.document,
          null,
          snapshot.window.XPathResult.FIRST_ORDERED_NODE_TYPE,
          null,
        ).singleNodeValue;
        assert.ok(node, occurrence.snapshotNodeLocator);
        assert.equal(node.textContent, occurrence.exactText);
      }
    } finally {
      snapshot.window.close();
    }
    await controller.start(controller.sessionId);
    await controller.pause();
    const resumed = await store.bundle(controller.sessionId!);
    assert.equal(resumed.captures.length, 2);
    assert.equal(
      resumed.captures[0].documentId,
      resumed.captures[1].documentId,
    );
    assert.ok(resumed.occurrences.some((o) => o.exactText === "変更後"));
    dom.window.document.querySelector("[hidden]")!.removeAttribute("hidden");
    dom.window.document.querySelector<HTMLElement>("p[style]")!.style.opacity =
      "1";
    dom.window.document.querySelector("details")!.open = true;
    await controller.start(controller.sessionId);
    await controller.pause();
    const revealed = await store.bundle(controller.sessionId!);
    for (const text of ["非表示", "透明", "閉鎖"])
      assert.equal(
        revealed.occurrences.filter((o) => o.exactText === text).length,
        1,
      );
    assert.equal(
      revealed.occurrences.filter((o) => o.exactText === "変更後").length,
      resumed.occurrences.filter((o) => o.exactText === "変更後").length,
    );
  } finally {
    await controller.pause();
    await store.close();
    dom.window.close();
  }
});

test("stopping and starting during hashing cannot move a capture into another session", async (context) => {
  const dom = new JSDOM("<button>最初の状態</button>", {
    url: "https://yukicoder.me/",
  });
  Object.assign(globalThis, {
    window: dom.window,
    location: dom.window.location,
    Element: dom.window.Element,
    Document: dom.window.Document,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    NodeFilter: dom.window.NodeFilter,
    CSS: { escape: cssEscape },
    MutationObserver: dom.window.MutationObserver,
  });
  const store = new IndexedDbStore(`transition-${crypto.randomUUID()}`);
  const controller = new CollectorController(dom.window.document, { store });
  const entered = deferred();
  const release = deferred();
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  let first = true;
  context.mock.method(
    crypto.subtle,
    "digest",
    async (...args: Parameters<typeof digest>) => {
      if (first) {
        first = false;
        entered.resolve();
        await release.promise;
      }
      return digest(...args);
    },
  );
  try {
    const started = controller.start();
    await entered.promise;
    const firstId = controller.sessionId!;
    await controller.stop();
    dom.window.document.querySelector("button")!.textContent = "次の状態";
    const restarted = controller.start();
    await new Promise<void>((resolve) => setImmediate(resolve));
    release.resolve();
    const [firstSession, secondSession] = await Promise.all([
      started,
      restarted,
    ]);
    await controller.pause();
    assert.equal(firstSession.sessionId, firstId);
    assert.notEqual(secondSession.sessionId, firstId);
    const before = await store.bundle(firstId);
    const after = await store.bundle(secondSession.sessionId);
    assert.equal(before.captures.length, 1);
    assert.equal(after.captures.length, 1);
    assert.notEqual(
      before.captures[0].documentId,
      after.captures[0].documentId,
    );
    assert.ok(
      before.occurrences.every((item) => item.exactText === "最初の状態"),
    );
    assert.ok(after.occurrences.every((item) => item.exactText === "次の状態"));
    assert.equal(before.session.status, "complete");
    assert.equal(
      before.session.captureFailures.length +
        after.session.captureFailures.length,
      0,
    );
  } finally {
    release.resolve();
    await controller.pause();
    await store.close();
    dom.window.close();
  }
});

for (const failure of [false, true])
  test(
    failure
      ? "failed subtree captures remain dirty until an unrelated interaction retries them"
      : "scoped interactions capture CSS-revealed text outside the event target",
    async (context) => {
      const dom = new JSDOM(
        '<style>aside {display:none} button[aria-expanded="true"] + aside {display:block}</style><button aria-expanded="false">開く</button><aside>表示されたメニュー</aside><section></section>',
        { url: "https://yukicoder.me/" },
      );
      Object.assign(globalThis, {
        window: dom.window,
        location: dom.window.location,
        Element: dom.window.Element,
        Document: dom.window.Document,
        HTMLButtonElement: dom.window.HTMLButtonElement,
        NodeFilter: dom.window.NodeFilter,
        CSS: { escape: cssEscape },
        MutationObserver: dom.window.MutationObserver,
      });
      const store = new IndexedDbStore(`visibility-${crypto.randomUUID()}`);
      // This regression drives captures explicitly; wall-clock mutation scans
      // must not race those requests when the test machine is busy.
      context.mock.timers.enable({ apis: ["setTimeout"] });
      const controller = new CollectorController(dom.window.document, {
        store,
      });
      try {
        await controller.start();
        const button = dom.window.document.querySelector("button")!;
        const panel = dom.window.document.querySelector("aside")!;
        assert.equal(dom.window.getComputedStyle(panel).display, "none");
        if (failure) {
          const section = dom.window.document.querySelector("section")!;
          section.textContent = "新しい場所";
          const stage = store.stageCapture.bind(store);
          let failed = false;
          context.mock.method(
            store,
            "stageCapture",
            async (...args: Parameters<typeof stage>) => {
              if (!failed) {
                failed = true;
                throw new Error("interrupted before staging");
              }
              return stage(...args);
            },
          );
          await controller.capture("mutation", [section]);
          assert.equal(
            (await store.bundle(controller.sessionId!)).captures.length,
            1,
          );
        } else {
          button.setAttribute("aria-expanded", "true");
          assert.equal(dom.window.getComputedStyle(panel).display, "block");
        }
        await controller.capture("interaction", [button]);
        await controller.pause();
        const bundle = await store.bundle(controller.sessionId!);
        assert.equal(bundle.captures.length, 2);
        const expected = failure ? "新しい場所" : "表示されたメニュー";
        assert.equal(
          bundle.occurrences.filter((item) => item.exactText === expected)
            .length,
          1,
        );
        assert.equal(bundle.session.captureFailures.length, failure ? 1 : 0);
      } finally {
        await controller.pause();
        await store.close();
        dom.window.close();
      }
    },
  );

for (const failure of [
  "create",
  "acknowledgement",
  "resume",
  "navigation",
] as const)
  test(`Start recovers after failed ${failure} persistence`, async (context) => {
    const dom = new JSDOM("<button>日本語</button>", {
      url: "https://yukicoder.me/",
    });
    Object.assign(globalThis, {
      window: dom.window,
      location: dom.window.location,
      Element: dom.window.Element,
      Document: dom.window.Document,
      HTMLButtonElement: dom.window.HTMLButtonElement,
      NodeFilter: dom.window.NodeFilter,
      CSS: { escape: cssEscape },
      Node: dom.window.Node,
      MutationObserver: dom.window.MutationObserver,
    });
    const store = new IndexedDbStore(
      `start-failure-${failure}-${crypto.randomUUID()}`,
    );
    let controller = new CollectorController(dom.window.document, { store });
    let resumeId: string | undefined;
    try {
      if (failure === "resume" || failure === "navigation") {
        resumeId = (await controller.start()).sessionId;
        await controller.pause();
        if (failure === "navigation")
          controller = new CollectorController(dom.window.document, { store });
      }
      const operation = resumeId ? "updateSession" : "createSession";
      const persist = store[operation].bind(store);
      const identities: string[] = [];
      let reject = true;
      context.mock.method(
        store,
        operation,
        async (session: Parameters<typeof persist>[0]) => {
          identities.push(session.sessionId);
          if (reject) {
            if (failure === "acknowledgement") await persist(session);
            throw new Error("Persistence unavailable");
          }
          return persist(session);
        },
      );
      await assert.rejects(
        controller.start(resumeId),
        /Persistence unavailable/u,
      );
      assert.equal(controller.recording, false);
      const before = await store.getSession(identities[0]);
      assert.equal(
        before?.status,
        resumeId
          ? "paused"
          : failure === "acknowledgement"
            ? "paused"
            : undefined,
      );
      reject = false;
      const session = await controller.start(resumeId);
      assert.equal(controller.recording, true);
      assert.equal(identities[0], identities[1]);
      assert.equal(
        (await store.getSession(session.sessionId))?.status,
        "recording",
      );
      assert.equal((await store.listSessions()).length, 1);
      assert.ok((await store.bundle(session.sessionId)).captures.length > 0);
    } finally {
      context.mock.restoreAll();
      await controller.pause();
      await store.close();
      dom.window.close();
    }
  });

test("dictionary updates rotate sessions while preserving historical classifications", async () => {
  const dom = new JSDOM("<nav><button>日本語</button></nav>", {
    url: "https://yukicoder.me/",
  });
  Object.assign(globalThis, {
    window: dom.window,
    location: dom.window.location,
    Element: dom.window.Element,
    Document: dom.window.Document,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    NodeFilter: dom.window.NodeFilter,
    CSS: { escape: cssEscape },
    Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver,
  });
  const store = new IndexedDbStore(
    `dictionary-rollover-${crypto.randomUUID()}`,
  );
  const first = new CollectorController(dom.window.document, {
    store,
    dictionary: {
      hash: "original",
      scopes: [{ messageId: "original-message", selector: "button" }],
    },
  });
  const next = new CollectorController(dom.window.document, {
    store,
    dictionary: {
      hash: "updated",
      scopes: [{ messageId: "updated-message", selector: "button" }],
    },
  });
  try {
    await first.start();
    await first.pause();
    await next.start(first.sessionId);
    assert.notEqual(next.sessionId, first.sessionId);
    const successor = await store.bundle(next.sessionId!);
    assert.equal(successor.session.dictionary.hash, "updated");
    assert.equal(successor.session.predecessorSessionId, first.sessionId);
    assert.ok(
      successor.occurrences.every(
        (row) =>
          row.dictionaryMessageIds.includes("updated-message") &&
          !row.dictionaryMessageIds.includes("original-message"),
      ),
    );
    const bundle = await store.bundle(first.sessionId!);
    assert.equal(bundle.session.dictionary.hash, "original");
    assert.equal(bundle.session.successorSessionId, next.sessionId);
    assert.equal(bundle.session.status, "complete");
    assert.ok(bundle.occurrences.length > 0);
    assert.ok(
      bundle.occurrences.every(
        (row) =>
          row.dictionaryMessageIds.includes("original-message") &&
          !row.dictionaryMessageIds.includes("updated-message"),
      ),
    );
  } finally {
    await first.pause();
    await next.pause();
    await store.close();
    dom.window.close();
  }
});

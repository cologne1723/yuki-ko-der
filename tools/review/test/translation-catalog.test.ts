import { strict as assert } from "node:assert";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import {
  resolveDictionary,
  validateCatalog,
} from "translation-core/translation-catalog";
import { checkCatalog } from "translation-core/catalog-files";
import { UiReviewStore } from "../src/ui-review.ts";
import { commonReviewMembers } from "translation-core/ui-review-groups";

test("review rejects new placeholders on static messages before changing the catalog", async () => {
  const root = await mkdtemp(join(tmpdir(), "review-invalid-target-"));
  try {
    await mkdir(join(root, "translations/ko"), { recursive: true });
    const path = join(root, "translations/ko.messages.json");
    const raw = JSON.stringify({
      messages: [
        {
          id: "name",
          source: "名前",
          reviewStatus: "unreviewed" as const,
          target: "이름",
        },
      ],
    });
    await writeFile(path, raw);
    await writeFile(
      join(root, "translations/ko/main.json"),
      JSON.stringify({ translations: [{ ref: "name", selector: "label" }] }),
    );
    const store = new UiReviewStore(root);
    const dictionary = (await store.list()).dictionaries[0];
    for (const action of ["save", "approve", "unapprove"])
      await assert.rejects(
        store.save("main.json", 0, {
          revision: dictionary.revision,
          target: "이름 {unexpected}",
          action,
        }),
        /변수/,
      );
    assert.equal(await readFile(path, "utf8"), raw);
    await checkCatalog(root);
    await store.save("main.json", 0, {
      revision: dictionary.revision,
      target: "성명",
      action: "save",
    });
    await checkCatalog(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("catalog selectors are parsed in CLI validation without a global document", async () => {
  const root = await mkdtemp(join(tmpdir(), "catalog-selectors-"));
  const originalDocument = globalThis.document;
  try {
    Reflect.deleteProperty(globalThis, "document");
    await mkdir(join(root, "translations/ko"), { recursive: true });
    await writeFile(
      join(root, "translations/ko.messages.json"),
      JSON.stringify({
        messages: [
          {
            id: "name",
            source: "名前",
            reviewStatus: "approved" as const,
            target: "이름",
          },
        ],
      }),
    );
    for (const selector of ["div..oops", "???", "div >", "p:has(div..oops)"]) {
      await writeFile(
        join(root, "translations/ko/a.json"),
        JSON.stringify({ translations: [{ ref: "name", selector }] }),
      );
      await assert.rejects(checkCatalog(root), /Invalid selector/, selector);
    }
    await writeFile(
      join(root, "translations/ko/a.json"),
      JSON.stringify({
        translations: [
          {
            ref: "name",
            selector: 'nav > a:is(.active, [aria-label="名前"]):not([hidden])',
          },
        ],
      }),
    );
    assert.deepEqual(await checkCatalog(root), { messages: 1, usages: 1 });
  } finally {
    if (originalDocument) globalThis.document = originalDocument;
    await rm(root, { recursive: true, force: true });
  }
});

test("catalog validation and resolution reject missing variant targets", () => {
  const selectorDocument = new JSDOM("").window.document;
  const message = {
    id: "name",
    source: "名前",
    reviewStatus: "approved" as const,
    target: "이름",
  };
  for (const alternatives of [
    undefined,
    [],
    [{ target: "성명", reviewStatus: "unreviewed" as const }],
  ]) {
    for (const variant of [-1, 0.5, 1]) {
      const catalog = { messages: [{ ...message, alternatives }] };
      const usage = { translations: [{ ref: "name", selector: "a", variant }] };
      assert.throws(
        () => validateCatalog(catalog, { a: usage }, selectorDocument),
        /Invalid translation variant/,
      );
      assert.throws(
        () => resolveDictionary(usage, catalog, selectorDocument),
        /Invalid translation variant/,
      );
    }
  }
  const usage = { translations: [{ ref: "name", selector: "a", variant: 0 }] };
  assert.throws(
    () => resolveDictionary(usage, { messages: [message] }, selectorDocument),
    /Invalid translation variant/,
  );
  const catalog = {
    messages: [
      {
        ...message,
        alternatives: [{ target: "성명", reviewStatus: "unreviewed" as const }],
      },
    ],
  };
  assert.doesNotThrow(() =>
    validateCatalog(catalog, { a: usage }, selectorDocument),
  );
  assert.equal(
    resolveDictionary(usage, catalog, selectorDocument).translations[0].target,
    "성명",
  );
});

test("catalog validation rejects collisions in assembled template patterns", () => {
  const selectorDocument = new JSDOM("").window.document;
  const usages = { a: { translations: [{ ref: "name", selector: "a" }] } };
  for (const message of [
    {
      id: "name",
      source: "{x}-{x}",
      reviewStatus: "approved" as const,
      target: "{x}-{x}",
      variables: { x: "\\w+" },
    },
    {
      id: "name",
      source: "{x}",
      reviewStatus: "approved" as const,
      target: "{x}",
      variables: { x: "(?<x>\\w+)" },
    },
  ]) {
    assert.throws(
      () => validateCatalog({ messages: [message] }, usages, selectorDocument),
      /Invalid combined translation pattern/,
    );
  }
  assert.doesNotThrow(() =>
    validateCatalog(
      {
        messages: [
          {
            id: "name",
            source: "{first}: {second}",
            reviewStatus: "approved" as const,
            target: "{second}: {first}",
            variables: { first: "\\w+", second: "\\d+" },
          },
        ],
      },
      usages,
      selectorDocument,
    ),
  );
});

test("repository stores each meaning once and page dictionaries contain only references", async () => {
  const result = await checkCatalog();
  assert.ok(result.messages < result.usages);
  const catalog = {
    messages: [
      {
        id: "name",
        source: "名前",
        reviewStatus: "approved" as const,
        target: "이름",
      },
    ],
  };
  const usages = { translations: [{ ref: "name", selector: "a" }] };
  assert.throws(
    () =>
      validateCatalog(
        {
          messages: [
            ...catalog.messages,
            {
              id: "another",
              source: "名前",
              reviewStatus: "approved" as const,
              target: "성명",
            },
          ],
        },
        { a: usages },
      ),
    /Duplicate translation meaning/,
  );
  assert.throws(
    () =>
      validateCatalog(catalog, {
        a: {
          translations: [
            {
              selector: "a",
              source: "名前",
              reviewStatus: "approved" as const,
              target: "이름",
            },
          ],
        },
      }),
    /Inline translation forbidden/,
  );
  assert.throws(
    () =>
      validateCatalog(catalog, {
        a: { translations: [{ ref: "missing", selector: "a" }] },
      }),
    /Unknown reference/,
  );
});

test("approval shares one variant across usages and preserves other contexts", async () => {
  const root = await mkdtemp(join(tmpdir(), "canonical-review-"));
  try {
    await mkdir(join(root, "translations/ko"), { recursive: true });
    const catalog = {
      messages: [
        {
          id: "name",
          source: "名前",
          reviewStatus: "approved" as const,
          target: "이름",
          alternatives: [
            { target: "성명", reviewStatus: "unreviewed" as const },
          ],
        },
      ],
    };
    const first = { translations: [{ ref: "name", selector: "nav a" }] };
    const second = {
      translations: [{ ref: "name", selector: "h1", variant: 0 }],
    };
    await writeFile(
      join(root, "translations/ko.messages.json"),
      JSON.stringify(catalog),
    );
    for (const [file, d] of [
      ["a.json", first],
      ["b.json", second],
      ["c.json", first],
    ] as const)
      await writeFile(join(root, "translations/ko", file), JSON.stringify(d));
    assert.equal(
      resolveDictionary(second, catalog, new JSDOM("").window.document)
        .translations[0].target,
      "성명",
    );
    const store = new UiReviewStore(root);
    const before = (await store.list()).dictionaries;
    const members = commonReviewMembers(before, "a.json", 0).map((m) => ({
      file: m.dictionary.file,
      index: m.index,
      revision: m.dictionary.revision,
    }));
    const result = await store.saveShared("a.json", 0, {
      target: "표시 이름",
      action: "approve",
      members,
    });
    assert.equal(result.count, 2);
    assert.deepEqual(
      result.dictionaries.map((d) => d.entries[0].target),
      ["표시 이름", "성명", "표시 이름"],
    );
    assert.equal(
      await readFile(join(root, "translations/ko/a.json"), "utf8"),
      JSON.stringify(first),
    );
    assert.equal(
      await readFile(join(root, "translations/ko/b.json"), "utf8"),
      JSON.stringify(second),
    );
    const saved = JSON.parse(
      await readFile(join(root, "translations/ko.messages.json"), "utf8"),
    );
    assert.equal(saved.messages.length, 1);
    assert.deepEqual(saved.messages[0].alternatives, [
      { target: "성명", reviewStatus: "unreviewed" },
    ]);
    await assert.rejects(
      store.saveShared("a.json", 0, {
        target: "낡은 수정",
        action: "approve",
        members,
      }),
      /변경/,
    );
    const current = (await store.list()).dictionaries[0];
    await store.save("a.json", 0, {
      target: "다시 검수",
      action: "unapprove",
      revision: current.revision,
    });
    assert.deepEqual(
      (await store.list()).dictionaries.map((d) => d.entries[0].target),
      ["다시 검수", "성명", "다시 검수"],
    );
    const variant = (await store.list()).dictionaries.find(
      (d) => d.file === "b.json",
    )!;
    assert.equal(variant.entries[0].variant, 0);
    await store.save("b.json", 0, {
      target: "표시 성명",
      action: "approve",
      revision: variant.revision,
    });
    const afterVariant = (await store.list()).dictionaries;
    assert.deepEqual(
      afterVariant.map((d) => [d.entries[0].target, d.entries[0].reviewStatus]),
      [
        ["다시 검수", "unreviewed"],
        ["표시 성명", "approved"],
        ["다시 검수", "unreviewed"],
      ],
    );
    assert.equal(commonReviewMembers(afterVariant, "b.json", 0).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("sanitized page cache notices changes to the source snapshot", async () => {
  const root = await mkdtemp(join(tmpdir(), "page-cache-"));
  try {
    await mkdir(join(root, "data/pages"), { recursive: true });
    const path = join(root, "data/pages/a.html");
    await writeFile(path, "<p>first</p><script>bad()</script>");
    const store = new UiReviewStore(root);
    const a = await store.page("a.html");
    assert.doesNotMatch(a, /<script/);
    assert.equal(await store.page("a.html"), a);
    await writeFile(path, "<p>updated snapshot</p>");
    assert.match(await store.page("a.html"), /updated snapshot/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("built extension loads one catalog and resolves page references", async () => {
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM("<body><nav><a>名前</a></nav><p>名前</p></body>", {
    url: "https://yukicoder.me/help",
    runScripts: "outside-only",
  });
  const requests: string[] = [];
  const observers: MutationObserver[] = [];
  const Observer = dom.window.MutationObserver;
  dom.window.MutationObserver = class extends Observer {
    constructor(callback: MutationCallback) {
      super(callback);
      observers.push(this);
    }
  };
  Object.assign(dom.window, {
    browser: { runtime: { getURL: (path: string) => path } },
    fetch: async (path: string) => {
      requests.push(path);
      return {
        ok: true,
        json: async () =>
          path === "translations/ko.messages.json"
            ? {
                messages: [
                  {
                    id: "name",
                    source: "名前",
                    reviewStatus: "unreviewed" as const,
                    target: "이름",
                  },
                ],
              }
            : {
                translations: path.endsWith("/help.json")
                  ? [{ ref: "name", selector: "nav a" }]
                  : [],
              },
      };
    },
  });
  try {
    dom.window.eval(
      await readFile("dist/extension/chrome/src/content.js", "utf8"),
    );
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    assert.equal(
      dom.window.document.querySelector("nav a")!.textContent,
      "이름",
    );
    assert.equal(dom.window.document.querySelector("p")!.textContent, "名前");
    assert.equal(
      requests.filter((p) => p === "translations/ko.messages.json").length,
      1,
    );
  } finally {
    observers.forEach((observer) => observer.disconnect());
    dom.window.close();
  }
});

test("CLI shape validation rejects malformed catalog values before domain checks", async () => {
  const root = await mkdtemp(join(tmpdir(), "catalog-shape-"));
  try {
    await mkdir(join(root, "translations/ko"), { recursive: true });
    await writeFile(
      join(root, "translations/ko/a.json"),
      JSON.stringify({ translations: [{ ref: "name", selector: "p" }] }),
    );
    for (const message of [
      null,
      {
        id: "name",
        source: 42,
        reviewStatus: "approved" as const,
        target: "x",
      },
      {
        id: "name",
        source: "x",
        reviewStatus: "approved" as const,
        target: "y",
        variables: { x: { values: {} } },
      },
      {
        id: "name",
        source: "x",
        reviewStatus: "approved" as const,
        target: "y",
        alternatives: "z",
      },
    ]) {
      await writeFile(
        join(root, "translations/ko.messages.json"),
        JSON.stringify({ messages: [message] }),
      );
      await assert.rejects(checkCatalog(root), /Invalid catalog shape/);
    }
    await writeFile(
      join(root, "translations/ko.messages.json"),
      JSON.stringify({
        messages: [
          {
            id: "name",
            source: "x",
            reviewStatus: "approved" as const,
            target: "y",
          },
        ],
      }),
    );
    await writeFile(
      join(root, "translations/ko/a.json"),
      JSON.stringify({
        translations: [
          {
            ref: "name",
            selector: "p",
            reviewStatus: "approved" as const,
            target: "inline",
          },
        ],
      }),
    );
    await assert.rejects(checkCatalog(root), /inline translations forbidden/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

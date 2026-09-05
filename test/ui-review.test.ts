import { strict as assert } from "node:assert";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UiReviewStore } from "../scripts/ui-review.ts";
import { applyTranslations } from "../src/fixed-translations.ts";
import { JSDOM } from "jsdom";

test("draft markers stay in dictionaries but disappear from text and attribute rendering", () => {
  const entries = [
    { selector: "a", source: "名前", target: "📝 이름" },
    {
      selector: "input",
      attribute: "placeholder",
      source: "{count}人",
      target: "📝 {count}명",
      variables: { count: "\\d+" },
    },
  ];
  const dom = new JSDOM('<a> 名前 </a><p>名前</p><input placeholder="12人">');
  applyTranslations(dom.window.document, entries);
  assert.equal(dom.window.document.querySelector("a")?.textContent, " 이름 ");
  assert.equal(
    dom.window.document.querySelector("input")?.getAttribute("placeholder"),
    "12명",
  );
  assert.equal(dom.window.document.querySelector("p")?.textContent, "名前");
  assert.equal(entries[0].target, "📝 이름");
});

test("UI review persists review actions, protects concurrent edits and named placeholders", async () => {
  const root = await mkdtemp(join(tmpdir(), "ui-review-"));
  try {
    await mkdir(join(root, "translations/ko"), { recursive: true });
    const path = join(root, "translations/ko/common.json");
    await writeFile(
      path,
      JSON.stringify({
        locale: "ko",
        translations: [
          {
            selector: "a",
            source: "{count}人",
            target: "📝 {count}명",
            variables: { count: "\\d+" },
          },
        ],
      }),
    );
    const store = new UiReviewStore(root);
    let revision = (await store.list()).dictionaries[0].revision;
    await assert.rejects(
      store.save("common.json", 0, { target: "명", revision, action: "save" }),
      /변수/,
    );
    const results = await Promise.allSettled([
      store.save("common.json", 0, {
        target: "인원 {count}",
        revision,
        action: "save",
      }),
      store.save("common.json", 0, {
        target: "{count}명",
        revision,
        action: "approve",
      }),
    ]);
    assert.equal(results[0].status, "fulfilled");
    assert.equal(results[1].status, "rejected");
    let dictionary = (await store.list()).dictionaries[0];
    assert.equal(dictionary.entries[0].target, "📝 인원 {count}");
    let result = await store.save("common.json", 0, {
      target: "인원 {count}",
      revision: dictionary.revision,
      action: "approve",
    });
    assert.equal(result.entry.target, "인원 {count}");
    result = await store.save("common.json", 0, {
      target: "{count}명",
      revision: result.revision,
      action: "save",
    });
    assert.equal(result.entry.target, "{count}명");
    result = await store.save("common.json", 0, {
      target: "{count}명",
      revision: result.revision,
      action: "unapprove",
    });
    assert.equal(result.entry.target, "📝 {count}명");
    assert.equal(JSON.parse(await readFile(path, "utf8")).locale, "ko");
    await assert.rejects(
      store.save("../common.json", 0, {
        target: "x",
        revision,
        action: "save",
      }),
      /올바르지/,
    );
    assert.deepEqual((await store.list()).pages, []);
    await mkdir(join(root, "tmp/pages"), { recursive: true });
    await writeFile(
      join(root, "tmp/pages/main.html"),
      '<script>alert(1)</script><a onclick="alert(1)" href="javascript:alert(1)">名前</a><iframe src="https://example.com"></iframe>',
    );
    const html = await store.page("main.html");
    assert.doesNotMatch(html, /<script|onclick|javascript:|<iframe/);
    assert.match(html, /名前/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("glossary client filters entries, previews unsaved edits, and saves explicit approval", async () => {
  const { build } = await import("esbuild");
  const bundle = await build({
    entryPoints: ["review/ui.ts"],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
  });
  const dom = new JSDOM(await readFile("review/ui.html", "utf8"), {
    url: "http://127.0.0.1:4175/ui",
    runScripts: "outside-only",
  });
  const { window } = dom;
  const entry = { selector: "nav a", source: "名前", target: "📝 이름" };
  let write: Record<string, string> | undefined;
  Object.assign(window, {
    fetch: async (path: string, init?: RequestInit) => ({
      ok: true,
      json: async () => {
        if (init?.method === "PUT") {
          write = JSON.parse(String(init.body));
          return {
            revision: "next",
            entry: { ...entry, target: write!.target },
          };
        }
        if (path === "/api/ui")
          return {
            dictionaries: [
              {
                file: "main.json",
                revision: "initial",
                entries: [
                  entry,
                  { selector: "h1", source: "題", target: "제목" },
                ],
              },
              {
                file: "help.json",
                revision: "help-initial",
                entries: [
                  { selector: "button", source: "ヘルプ", target: "📝 도움말" },
                ],
              },
            ],
            pages: ["main.html", "help.html"],
          };
        return {
          html: "<html><body><nav><a>名前</a></nav><h1>題</h1><p>名前</p><button>ヘルプ</button></body></html>",
        };
      },
    }),
    confirm: () => true,
  });
  const settle = async () => {
    for (let i = 0; i < 5; i++)
      await new Promise((resolve) => setTimeout(resolve, 0));
  };
  try {
    window.localStorage.setItem("ui-review-sidebar-collapsed", "true");
    window.eval(bundle.outputFiles[0].text);
    await settle();
    const doc = window.document;
    assert.equal(doc.documentElement.lang, "ko");
    const japanesePane = doc.querySelector<HTMLElement>("#japanese-pane")!;
    assert.equal(japanesePane.hidden, true);
    doc.querySelector<HTMLButtonElement>("#japanese-toggle")!.click();
    assert.equal(japanesePane.hidden, false);
    const sidebar = doc.querySelector<HTMLElement>("#glossary-sidebar")!;
    const toggle = doc.querySelector<HTMLButtonElement>("#sidebar-toggle")!;
    assert.equal(sidebar.hidden, true);
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    toggle.click();
    assert.equal(sidebar.hidden, false);
    assert.equal(toggle.textContent, "목록 접기");
    assert.equal(
      window.localStorage.getItem("ui-review-sidebar-collapsed"),
      "false",
    );
    assert.equal(doc.querySelectorAll("#entries button").length, 3);
    const korean = doc.querySelector<HTMLIFrameElement>("#korean")!;
    assert.match(korean.srcdoc, /이름/);
    let preview = new JSDOM(korean.srcdoc);
    assert.equal(
      preview.window.document
        .querySelector("nav a")
        ?.getAttribute("data-review-status"),
      "draft",
    );
    assert.equal(
      preview.window.document
        .querySelector("h1")
        ?.getAttribute("data-review-status"),
      "approved",
    );
    assert.equal(
      preview.window.document
        .querySelector("p")
        ?.hasAttribute("data-review-status"),
      false,
    );
    preview.window.close();
    assert.doesNotMatch(korean.srcdoc, /📝/);
    assert.match(korean.srcdoc, /<p>名前<\/p>/);
    assert.match(doc.querySelector("#matches")!.textContent!, /1(?:곳|개)/);
    const target = doc.querySelector<HTMLTextAreaElement>("#target")!;
    target.value = "성명";
    target.dispatchEvent(new window.Event("input"));
    assert.match(korean.srcdoc, /성명/);
    assert.match(
      doc.querySelector("#change-summary")!.textContent!,
      /수정 전: 이름/,
    );
    assert.match(
      doc.querySelector("#change-summary")!.textContent!,
      /수정 후: 성명/,
    );
    assert.match(korean.srcdoc, /수정 중/);
    assert.equal(
      doc.querySelector("#dirty")!.textContent,
      "저장하지 않은 수정 내용",
    );
    doc.querySelector<HTMLButtonElement>("#approve")!.click();
    await settle();
    assert.equal(write?.action, "approve");
    assert.equal(write?.target, "성명");
    assert.equal(target.value, "도움말");
    assert.equal(doc.querySelector("#badge")!.textContent, "미검수");
    assert.equal(
      doc.querySelector<HTMLSelectElement>("#page")!.value,
      "help.html",
    );
    assert.equal(doc.activeElement, target);
    assert.match(doc.querySelector("#notice")!.textContent!, /다음 미검수/);
    // Return to the saved entry to inspect its retained before/after and status.
    doc.querySelector<HTMLButtonElement>("#entries button")!.click();
    await settle();
    assert.equal(doc.querySelector("#badge")!.textContent, "검수 완료");
    assert.match(
      doc.querySelector("#change-summary")!.textContent!,
      /이번 검수에서 저장한 변경/,
    );
    assert.match(doc.querySelector("#entries")!.textContent!, /수정됨/);
    preview = new JSDOM(korean.srcdoc);
    assert.equal(
      preview.window.document
        .querySelector("nav a")
        ?.getAttribute("data-review-status"),
      "approved",
    );
    preview.window.close();
    // Mount the generated preview to exercise cross-frame selection and locating.
    korean.contentDocument!.body.innerHTML =
      '<nav><a data-review-match="true" data-review-entry="main.json:0">성명</a></nav><h1 data-review-entry="main.json:1">제목</h1>';
    let located = 0;
    korean.contentDocument!.querySelector("a")!.scrollIntoView = () => {
      located++;
    };
    korean.dispatchEvent(new window.Event("load"));
    doc.querySelector<HTMLButtonElement>("#locate")!.click();
    assert.ok(located > 0);
    korean.contentDocument!.querySelector("h1")!.click();
    assert.equal(target.value, "제목");
    assert.equal(doc.querySelector("#badge")!.textContent, "검수 완료");
    const status = doc.querySelector<HTMLSelectElement>("#status")!;
    status.value = "draft";
    status.dispatchEvent(new window.Event("change"));
    assert.equal(doc.querySelectorAll("#entries button").length, 1);
    doc.querySelector<HTMLButtonElement>("#entries button")!.click();
    await settle();
    doc.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: "Enter",
        ctrlKey: true,
        bubbles: true,
      }),
    );
    await settle();
    assert.equal(write?.action, "approve");
    assert.equal(write?.target, "도움말");
    assert.equal(doc.querySelectorAll("#entries button").length, 0);
    assert.match(
      doc.querySelector("#notice")!.textContent!,
      /남은 미검수 항목이 없습니다/,
    );
  } finally {
    window.close();
  }
});

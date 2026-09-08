import assert from "node:assert/strict";
import test from "node:test";
import { reactPage } from "./react-fixture.ts";
import type { ProblemReview } from "../src/problem-review.ts";
const problems: ProblemReview[] = [1, 2].map((problemNo) => ({
  problemNo,
  japaneseTitle: `Original ${problemNo}`,
  koreanTitle: `Draft ${problemNo}`,
  reviewStatus: problemNo === 1 ? "unreviewed" : "approved",
  machineTranslated: problemNo === 1,
  japaneseHtml: "<p>Original</p>",
  koreanSource: `<p>Draft ${problemNo}</p>`,
  koreanHtml: `<p>Draft ${problemNo}</p>`,
  sourceFormat: "html",
  revision: `r${problemNo}`,
  validationWarnings: [],
}));
for (const fails of [false, true])
  test(`React problem save ${fails ? "failure" : "success"} preserves identity and blocks navigation while pending`, async (t) => {
    let settle: (r: Response) => void = () => {
      throw new Error("Not saving");
    };
    let body: any;
    const page = reactPage(t, async (path, init) => {
      if (init?.method === "PUT") {
        body = JSON.parse(String(init.body));
        assert.equal(path, "/api/problems/1");
        return new Promise((r) => (settle = r));
      }
      return Response.json(
        path === "/api/problems"
          ? { problems }
          : problems[Number(path.split("/").at(-1)) - 1],
      );
    });
    await page.screen.findByRole("button", { name: "저장", exact: true });
    page.edit("<p>Changed</p>");
    await page.screen.findByText("저장하지 않음");
    await page.user.click(
      page.screen.getByRole("button", { name: "저장", exact: true }),
    );
    await page.waitFor(() => assert.equal(body.revision, "r1"));
    await page.navigate("/?problem=2");
    await page.screen.findByRole("dialog");
    assert.match(page.dom.window.document.body.textContent!, /저장 중입니다/);
    await page.user.click(
      page.screen.getByRole("button", { name: "계속 편집" }),
    );
    settle(
      fails
        ? Response.json({ error: "Conflict" }, { status: 409 })
        : Response.json({
            ...problems[0],
            koreanSource: "<p>Changed</p>",
            revision: "r2",
          }),
    );
    if (fails) {
      await page.screen.findByText("Conflict");
      assert.match(
        page.dom.window.document.querySelector(".cm-content")!.textContent!,
        /Changed/,
      );
      await page.navigate("/?problem=2");
      await page.user.click(
        await page.screen.findByRole("button", { name: "변경 버리고 이동" }),
      );
    } else {
      await page.waitFor(() =>
        assert.equal(Boolean(page.screen.queryByText("저장하지 않음")), false),
      );
      await page.navigate("/?problem=2");
    }
    await page.screen.findByRole("heading", { name: "2. Draft 2" });
    assert.match(
      page.dom.window.document.querySelector(".cm-content")!.textContent!,
      /Draft 2/,
    );
  });
test("problem status distinguishes machine, unreviewed and approved independently of validation", async (t) => {
  const page = reactPage(t, async (path) =>
    Response.json(path === "/api/problems" ? { problems } : problems[0]),
  );
  await page.screen.findByRole("heading", { name: "1. Draft 1" });
  assert.ok(page.screen.getAllByText("기계 번역 · 미검수").length);
  assert.ok(page.screen.getAllByText("승인됨").length);
});
test("missing problem originals show a retry and contextual download action", async (t) => {
  const page = reactPage(t, async (path) =>
    path === "/api/problems"
      ? Response.json({ problems })
      : Response.json({ error: "Refresh original" }, { status: 404 }),
  );
  await page.screen.findByText("Refresh original");
  assert.ok(page.screen.getByRole("button", { name: "다시 시도" }));
  assert.ok(page.screen.getAllByLabelText("검사 작업").length);
});
const entry = {
  selector: "nav a",
  source: "名前",
  target: "이름",
  reviewStatus: "unreviewed",
  messageId: "name",
};
const glossary = () => ({
  dictionaries: [
    { file: "main.json", revision: "r1", entries: [{ ...entry }] },
    { file: "user.json", revision: "r1", entries: [{ ...entry }] },
  ],
  pages: ["main.html"],
  sourceContexts: [],
});
test("glossary saves explicit shared approval and preserves failed drafts", async (t) => {
  let data = glossary();
  let fail = true;
  let body: any;
  const page = reactPage(
    t,
    async (path, init) => {
      if (init?.method === "PUT") {
        body = JSON.parse(String(init.body));
        assert.equal(path, "/api/ui-shared/main.json/0");
        if (fail) return Response.json({ error: "Conflict" }, { status: 409 });
        data = {
          ...data,
          dictionaries: data.dictionaries.map((d) => ({
            ...d,
            revision: "r2",
            entries: d.entries.map((e) => ({
              ...e,
              target: body.target,
              reviewStatus: "approved",
            })),
          })),
        };
        return Response.json({ dictionaries: data.dictionaries });
      }
      return Response.json(data);
    },
    "/ui",
    "glossary",
  );
  const target = await page.screen.findByLabelText("한국어 번역");
  await page.user.clear(target);
  await page.user.type(target, "사용자 이름");
  await page.user.click(page.screen.getByRole("button", { name: "검수 승인" }));
  await page.screen.findByText("Conflict");
  assert.equal(target.value, "사용자 이름");
  assert.equal(body.action, "approve");
  assert.equal(body.members.length, 2);
  fail = false;
  await page.user.click(page.screen.getByRole("button", { name: "검수 승인" }));
  await page.waitFor(() =>
    assert.ok(page.screen.getAllByText("승인됨").length),
  );
  assert.equal(Boolean(page.screen.queryByText("Conflict")), false);
});
test("glossary automatically selects a preview and retains isolated translated frames", async (t) => {
  const page = reactPage(
    t,
    async (path) =>
      Response.json(
        path.startsWith("/api/ui-pages/")
          ? { html: "<nav><a>名前</a></nav><script>alert(1)</script>" }
          : glossary(),
      ),
    "/ui",
    "glossary",
  );
  await page.screen.findByLabelText("한국어 번역");
  await page.waitFor(() =>
    assert.equal(page.dom.window.document.querySelectorAll("iframe").length, 2),
  );
  const frames = [...page.dom.window.document.querySelectorAll("iframe")];
  assert.ok(frames.every((f) => f.getAttribute("sandbox") === ""));
  assert.doesNotMatch(frames[0].srcdoc, /<script/);
  assert.match(frames[1].srcdoc, /이름/);
});
test("task results separate successful validation from human review and prevent stale conversion", async (t) => {
  const task = {
    id: "test",
    input: { operation: "convert-problem", problemNo: 1 },
    status: "completed",
    startedAt: new Date().toISOString(),
    progress: [],
    stale: true,
    result: {
      items: [
        {
          id: "1",
          status: "passed",
          message: "Validation passed",
          reviewStatus: "unreviewed",
        },
      ],
      artifact: { problemNo: 1, content: "# Example" },
    },
  };
  const page = reactPage(
    t,
    async (path) =>
      Response.json(
        path === "/api/tasks/recovery"
          ? []
          : path === "/api/tasks"
            ? [task]
            : path === "/api/tasks/test"
              ? task
              : path === "/api/settings"
                ? { activeDataDirectory: "/data", nextDataDirectory: "/data" }
                : { pages: [], dictionaries: [] },
      ),
    "/tools",
  );

  const resultButton = () =>
    [...page.dom.window.document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("작업 종료"),
    );
  await page.waitFor(() => assert.ok(resultButton()));
  await page.user.click(resultButton());
  await page.screen.findByText("Validation passed");
  assert.ok(page.screen.getByText("미검수"));
  assert.equal(
    page.screen.getByRole("button", { name: "검증된 MDX로 원본 HTML 교체" })
      .disabled,
    true,
  );
});

test("filtering the problem list preserves the selected unsaved document", async (t) => {
  const page = reactPage(t, async (path) =>
    Response.json(
      path === "/api/problems"
        ? { problems }
        : problems[Number(path.split("/").at(-1)) - 1],
    ),
  );
  await page.screen.findByRole("heading", { name: "1. Draft 1" });
  page.edit("<p>Unsaved work</p>");
  await page.screen.findByText("저장하지 않음");
  await page.user.type(page.screen.getByLabelText("문제 검색"), "2");
  assert.ok(page.screen.getByRole("heading", { name: "1. Draft 1" }));
  assert.match(
    page.dom.window.document.querySelector(".cm-content")!.textContent!,
    /Unsaved work/,
  );
});

test("filtering the glossary preserves the selected unsaved wording", async (t) => {
  const page = reactPage(
    t,
    async () => Response.json(glossary()),
    "/ui",
    "glossary",
  );
  const target = await page.screen.findByLabelText("한국어 번역");
  await page.user.type(target, " 수정 중");
  await page.user.type(
    page.screen.getByLabelText("문구 검색"),
    "unmatched search",
  );
  assert.equal(page.screen.getByLabelText("한국어 번역").value, "이름 수정 중");
});

test("task polling reconnects to a running worker and cancellation refreshes its status", async (t) => {
  let status = "running";
  let cancellations = 0;
  const task = () => ({
    id: "active",
    input: { operation: "setup" },
    status,
    startedAt: new Date().toISOString(),
    progress: [],
  });
  const page = reactPage(
    t,
    async (path, init) => {
      if (path.endsWith("/cancel") && init?.method === "POST") {
        cancellations++;
        status = "cancelled";
        return Response.json(task());
      }
      return Response.json(
        path === "/api/tasks"
          ? [task()]
          : path === "/api/tasks/recovery"
            ? []
            : path === "/api/tasks/active"
              ? task()
              : path === "/api/settings"
                ? { activeDataDirectory: "/data", nextDataDirectory: "/data" }
                : { pages: [], dictionaries: [] },
      );
    },
    "/tools",
  );
  const button = () =>
    [...page.dom.window.document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("실행 중"),
    );
  await page.waitFor(() => assert.ok(button()));
  await page.user.click(button());
  await page.user.click(
    await page.screen.findByRole("button", { name: "중단", exact: true }),
  );
  await page.waitFor(() => assert.equal(cancellations, 1));
  await page.screen.findByRole("button", { name: "다시 실행" });
  assert.ok(page.screen.getAllByText("중단됨").length);
});

test("completed refresh updates originals while preserving an unsaved problem draft", async (t) => {
  let refreshed = false;
  const task = {
    id: "refresh",
    input: { operation: "setup", problems: "1", selection: "problems" },
    status: "completed",
    progress: [],
    startedAt: new Date().toISOString(),
    result: { operation: "setup", items: [] },
  };
  const page = reactPage(t, async (path, init) => {
    if (path === "/api/tasks" && init?.method === "POST") {
      refreshed = true;
      return Response.json(task);
    }
    if (path === "/api/tasks/refresh") return Response.json(task);
    return Response.json(
      path === "/api/problems"
        ? { problems }
        : {
            ...problems[0],
            japaneseHtml: refreshed
              ? "<p>Updated original</p>"
              : "<p>Original</p>",
          },
    );
  });
  await page.screen.findByRole("heading", { name: "1. Draft 1" });
  page.edit("<p>Keep this draft</p>");
  await page.screen.findByText("저장하지 않음");
  await page.user.click(
    page.screen.getByRole("combobox", { name: "검사 작업" }),
  );
  await page.user.click(
    await page.screen.findByRole("option", { name: "원문 다운로드" }),
  );
  await page.user.click(
    page.screen.getByRole("button", { name: "실행", exact: true }),
  );
  await page.user.click(
    await page.screen.findByRole("button", { name: "작업 결과 닫기" }),
  );
  await page.waitFor(() =>
    assert.match(
      page.dom.window.document.querySelector<HTMLIFrameElement>(
        'iframe[title="일본어 원문"]',
      )!.srcdoc,
      /Updated original/,
    ),
  );
  assert.match(
    page.dom.window.document.querySelector(".cm-content")!.textContent!,
    /Keep this draft/,
  );
});

test("glossary lists context variants separately and reload recovers a revision conflict", async (t) => {
  let data = {
    dictionaries: [
      {
        file: "main.json",
        revision: "r1",
        entries: [
          { ...entry },
          { ...entry, variant: 0, selector: "h1", target: "다른 표현" },
        ],
      },
    ],
    pages: [],
    sourceContexts: [],
  };
  let lastRevision = "";
  const page = reactPage(
    t,
    async (path, init) => {
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body));
        lastRevision = body.revision;
        if (body.revision !== data.dictionaries[0].revision)
          return Response.json({ error: "Revision conflict" }, { status: 409 });
        data = {
          ...data,
          dictionaries: [
            {
              ...data.dictionaries[0],
              revision: "r3",
              entries: data.dictionaries[0].entries.map((e, i) =>
                i === 0 ? { ...e, target: body.target } : e,
              ),
            },
          ],
        };
        return Response.json({
          revision: "r3",
          entry: data.dictionaries[0].entries[0],
          dictionaries: data.dictionaries,
        });
      }
      return Response.json(data);
    },
    "/ui",
    "glossary",
  );
  const target = await page.screen.findByLabelText("한국어 번역");
  assert.ok(page.screen.getByText("다른 표현"));
  await page.user.type(target, " 내 초안");
  data = {
    ...data,
    dictionaries: [
      {
        ...data.dictionaries[0],
        revision: "r2",
        entries: [
          { ...entry, target: "외부 수정" },
          data.dictionaries[0].entries[1],
        ],
      },
    ],
  };
  await page.user.click(page.screen.getByRole("button", { name: "초안 저장" }));
  await page.screen.findByText("Revision conflict");
  assert.equal(lastRevision, "r1");
  await page.user.click(
    page.screen.getByRole("button", { name: "문구 다시 불러오기" }),
  );
  await page.user.click(
    await page.screen.findByRole("button", { name: "계속 편집" }),
  );
  assert.equal(target.value, "이름 내 초안");
  await page.user.click(
    page.screen.getByRole("button", { name: "문구 다시 불러오기" }),
  );
  await page.user.click(
    await page.screen.findByRole("button", { name: "버리고 다시 불러오기" }),
  );
  await page.waitFor(() => assert.equal(target.value, "외부 수정"));
  await page.user.click(page.screen.getByRole("button", { name: "초안 저장" }));
  await page.waitFor(() => assert.equal(lastRevision, "r2"));
});

test("comparison scroll listeners follow each newly loaded iframe document", async (t) => {
  const page = reactPage(t, async () => Response.json({}), "/preview");
  const left = page.dom.window.document.querySelector<HTMLIFrameElement>(
    'iframe[title="일본어 원문"]',
  )!;
  const right = page.dom.window.document.querySelector<HTMLIFrameElement>(
    'iframe[title="한국어 번역"]',
  )!;
  const doc = (height: number) => {
    const d = page.dom.window.document.implementation.createHTMLDocument();
    Object.defineProperty(d, "scrollingElement", { value: d.documentElement });
    Object.defineProperty(d.documentElement, "scrollHeight", { value: height });
    Object.defineProperty(d.documentElement, "clientHeight", { value: 100 });
    return d;
  };
  const a = doc(200),
    b = doc(300);
  const load = (frame: HTMLIFrameElement, document: Document) => {
    Object.defineProperty(frame, "contentDocument", {
      configurable: true,
      value: document,
    });
    page.fireEvent.load(frame);
  };
  load(left, a);
  load(right, b);
  await page.user.click(page.screen.getByLabelText("제목 기준 스크롤 동기화"));
  a.documentElement.scrollTop = 50;
  a.dispatchEvent(new page.dom.window.Event("scroll"));
  assert.equal(b.documentElement.scrollTop, 100);
  const replacement = doc(200);
  load(left, replacement);
  b.documentElement.scrollTop = 0;
  a.documentElement.scrollTop = 25;
  a.dispatchEvent(new page.dom.window.Event("scroll"));
  assert.equal(b.documentElement.scrollTop, 0);
  replacement.documentElement.scrollTop = 80;
  replacement.dispatchEvent(new page.dom.window.Event("scroll"));
  assert.equal(b.documentElement.scrollTop, 160);
});

test("glossary prefers observed pages and preserves a manual preview while editing", async (t) => {
  const data = {
    ...glossary(),
    pages: ["other.html", "main.html", "observed.html"],
    coverage: [
      {
        file: "main.json",
        index: 0,
        source: entry.source,
        pages: ["missing.html", "observed.html"],
      },
    ],
  };
  const page = reactPage(
    t,
    async (path) =>
      Response.json(
        path.startsWith("/api/ui-pages/")
          ? { html: "<nav><a>名前</a></nav>" }
          : data,
      ),
    "/ui",
    "glossary",
  );
  const selector = await page.screen.findByRole("combobox", {
    name: "미리보기 페이지",
  });
  await page.waitFor(() => assert.equal(selector.value, "observed.html"));
  await page.user.click(selector);
  await page.user.click(
    await page.screen.findByRole("option", { name: "other.html" }),
  );
  await page.user.type(page.screen.getByLabelText("한국어 번역"), "!");
  assert.equal(selector.value, "other.html");
});

test("extension-only glossary messages still open an available preview automatically", async (t) => {
  const data = {
    ...glossary(),
    dictionaries: [
      {
        file: "extension.json",
        revision: "r1",
        entries: [
          { ...entry, selector: "#__yukicoder_extension_problem_load_failed" },
        ],
      },
    ],
  };
  const page = reactPage(
    t,
    async (path) =>
      Response.json(
        path.startsWith("/api/ui-pages/")
          ? { html: "<p>Saved page</p>" }
          : data,
      ),
    "/ui",
    "glossary",
  );
  await page.waitFor(() =>
    assert.equal(page.dom.window.document.querySelectorAll("iframe").length, 2),
  );
  assert.equal(
    page.screen.getByRole("combobox", { name: "미리보기 페이지" }).value,
    "main.html",
  );
});

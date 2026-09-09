import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReviewApp } from "../src/review-server.ts";
import { fixture } from "./collection-fixture.ts";
import { createZip } from "../../ui-collector/src/export.ts";
import { reactPage } from "./react-fixture.ts";
function bytes(source = "日本語") {
  const f = fixture(
    `<html><head></head><body><button data-collector-node="1">${source}</button></body></html>`,
  );
  f.occurrences[0].category = "interface";
  f.occurrences[0].liveCssSelectorHint = "button";
  f.occurrences[0].exactText = source;
  f.findings[0].normalizedText = source;
  return createZip(f);
}
async function setup(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "react-import-"));
  await mkdir(join(root, "translations/ko"), { recursive: true });
  await writeFile(
    join(root, "translations/ko.messages.json"),
    '{"messages":[]}',
  );
  await writeFile(
    join(root, "translations/ko/main.json"),
    '{"translations":[]}',
  );
  const app = createReviewApp({ repositoryRoot: root, assetRoot: root });
  let fail = false;
  const requests = new Set<Promise<Response>>();
  const saves: Promise<Response>[] = [];
  const held: Array<() => void> = [];
  let hold = false;
  const page = reactPage(
    t,
    (path, init) => {
      const work = (async () => {
        if (fail && init?.method === "PUT" && !path.endsWith("selection"))
          return Response.json({ error: "Save failed" }, { status: 500 });
        if (hold && path.includes("/snapshot/"))
          await new Promise<void>((r) => held.push(r));
        const body =
          init?.body && typeof (init.body as Blob).arrayBuffer === "function"
            ? new Uint8Array(await (init.body as Blob).arrayBuffer())
            : init?.body;
        return app.request(`http://localhost${path}`, {
          ...init,
          body,
          headers: {
            ...Object.fromEntries(new Headers(init?.headers)),
            host: "localhost",
          },
        });
      })();
      requests.add(work);
      if (init?.method === "PUT" && !path.endsWith("selection"))
        saves.push(work);
      void work.finally(() => requests.delete(work));
      return work;
    },
    "/ui?view=imports",
    "imports",
  );
  t.after(async () => {
    held.forEach((r) => r());
    await Promise.allSettled([...requests]);
    await rm(root, { recursive: true, force: true });
  });
  async function upload(items: Array<{ name: string; bytes: Uint8Array }>) {
    const input = page.dom.window.document.querySelector("input[type=file]")!;
    await page.user.upload(
      input,
      items.map((f) => {
        const file = new page.dom.window.File(
          [Uint8Array.from(f.bytes).buffer],
          f.name,
          { type: "application/zip" },
        );
        Object.defineProperty(file, "arrayBuffer", {
          value: async () => Uint8Array.from(f.bytes).buffer,
        });
        return file;
      }),
    );
    await page.user.click(
      page.screen.getByRole("button", { name: "가져오기", exact: true }),
    );
    // Imports verify ZIPs and write files sequentially; shared CI can exceed
    // Testing Library's default one-second wait even when imports succeed.
    await page.screen.findByText(
      `${items.at(-1)!.name}: 가져오기 완료`,
      {},
      { timeout: 10_000 },
    );
  }
  return {
    ...page,
    root,
    app,
    saves,
    upload,
    held,
    hold: (v: boolean) => {
      hold = v;
    },
    fail: (v: boolean) => {
      fail = v;
    },
  };
}
test("React ZIP import reports partial failures and duplicates, retains failed drafts, explicitly approves and advances", async (t) => {
  const p = await setup(t);
  await p.upload([
    { name: "one.zip", bytes: bytes() },
    { name: "broken.zip", bytes: new Uint8Array([1]) },
    { name: "duplicate.zip", bytes: bytes() },
    { name: "two.zip", bytes: bytes("次へ") },
  ]);
  assert.match(p.dom.window.document.body.textContent!, /broken.zip/);
  assert.match(
    p.dom.window.document.body.textContent!,
    /duplicate.zip.*이미 가져온 자료/,
  );
  // Select the first queued task explicitly: the last import can finish after
  // the initial selection, and approve-and-next needs a remaining successor.
  const imported = await (
    await p.app.request("http://localhost/api/ui/imports", {
      headers: { host: "localhost" },
    })
  ).json();
  await p.navigate(`/ui?view=imports&item=${imported.tasks[0].id}`);
  await p.waitFor(() =>
    assert.equal(
      p.screen.getByLabelText("일본어 원문").value,
      imported.tasks[0].source,
    ),
  );
  const target = await p.screen.findByLabelText("한국어 번역");
  const before = p.screen.getByLabelText("일본어 원문").value;
  await p.user.type(target, "한국어");
  p.fail(true);
  await p.user.click(p.screen.getByRole("button", { name: "초안 저장" }));
  await p.screen.findByText("Save failed");
  assert.equal(target.value, "한국어");
  p.fail(false);
  await p.waitFor(() =>
    assert.equal(
      p.screen.getByRole("button", { name: "초안 저장" }).disabled,
      false,
    ),
  );
  await p.user.click(p.screen.getByRole("button", { name: "초안 저장" }));
  // Wait for the actual filesystem-backed save, not a one-second polling deadline.
  assert.equal(p.saves.length, 2);
  assert.equal((await p.saves[1]).status, 200);
  assert.equal(
    JSON.parse(
      await readFile(join(p.root, "translations/ko.messages.json"), "utf8"),
    ).messages.length,
    1,
  );
  let catalog = JSON.parse(
    await readFile(join(p.root, "translations/ko.messages.json"), "utf8"),
  );
  assert.equal(catalog.messages[0].reviewStatus, "unreviewed");
  await p.waitFor(() =>
    assert.equal(
      p.screen.getByRole("button", { name: "승인하고 다음" }).disabled,
      false,
    ),
  );
  await p.user.click(p.screen.getByRole("button", { name: "승인하고 다음" }));
  await p.waitFor(() =>
    assert.notEqual(p.screen.getByLabelText("일본어 원문").value, before),
  );
  catalog = JSON.parse(
    await readFile(join(p.root, "translations/ko.messages.json"), "utf8"),
  );
  assert.equal(catalog.messages[0].reviewStatus, "approved");
  assert.equal(p.screen.getByLabelText("한국어 번역").value, "");
  await p.waitFor(() =>
    assert.ok(p.dom.window.document.querySelector("iframe")),
  );
  const frame = p.dom.window.document.querySelector("iframe");
  assert.equal(frame?.getAttribute("sandbox"), "");
  assert.match(frame?.srcdoc ?? "", /default-src 'none'/);
});
test("React import navigation requires an explicit discard decision and late snapshots cannot replace current context", async (t) => {
  const p = await setup(t);
  p.hold(true);
  await p.upload([
    { name: "one.zip", bytes: bytes() },
    { name: "two.zip", bytes: bytes("次へ") },
  ]);
  await p.screen.findByLabelText("한국어 번역");
  const data = await (
    await p.app.request("http://localhost/api/ui/imports", {
      headers: { host: "localhost" },
    })
  ).json();
  const first = p.screen.getByLabelText("일본어 원문").value;
  const next = data.tasks.find(
    (task: { source: string }) => task.source !== first,
  );
  await p.user.type(p.screen.getByLabelText("한국어 번역"), "작성 중");
  await p.navigate(`/ui?view=imports&item=${next.id}`);
  await p.screen.findByRole("dialog");
  await p.user.click(p.screen.getByRole("button", { name: "계속 편집" }));
  assert.equal(p.screen.getByLabelText("한국어 번역").value, "작성 중");
  await p.navigate(`/ui?view=imports&item=${next.id}`);
  await p.user.click(
    await p.screen.findByRole("button", { name: "변경 버리고 이동" }),
  );
  await p.waitFor(() =>
    assert.equal(p.screen.getByLabelText("일본어 원문").value, next.source),
  );
  await p.waitFor(() => assert.equal(p.held.length, 2));
  p.held[1]();
  await p.waitFor(() =>
    assert.ok(
      p.dom.window.document
        .querySelector("iframe")
        ?.srcdoc.includes(next.source),
    ),
  );
  p.held[0]();
  await new Promise((r) => setImmediate(r));
  assert.ok(
    p.dom.window.document.querySelector("iframe")?.srcdoc.includes(next.source),
  );
});
test("React import progress actions confirm draft discard and collection filters select matching tasks", async (t) => {
  const p = await setup(t);
  await p.upload([
    { name: "one.zip", bytes: bytes() },
    { name: "two.zip", bytes: bytes("次へ") },
  ]);
  const target = await p.screen.findByLabelText("한국어 번역");
  await p.user.type(target, "작성 중");
  await p.user.click(
    p.screen.getByRole("button", { name: "보류", exact: true }),
  );
  await p.screen.findByRole("dialog");
  await p.user.click(p.screen.getByRole("button", { name: "계속 편집" }));
  assert.equal(target.value, "작성 중");
  await p.user.click(
    p.screen.getByRole("button", { name: "제외", exact: true }),
  );
  await p.user.click(
    await p.screen.findByRole("button", { name: "변경 버리고 계속" }),
  );
  await p.waitFor(() => assert.equal(target.value, ""));
  const data = await (
    await p.app.request("http://localhost/api/ui/imports", {
      headers: { host: "localhost" },
    })
  ).json();
  const original = p.screen.getByLabelText("일본어 원문").value;
  const other = data.tasks.find(
    (task: { source: string }) => task.source !== original,
  );
  await p.navigate(
    `/ui?view=imports&collection=${other.locations[0].collectionId}`,
  );
  await p.waitFor(() =>
    assert.equal(p.screen.getByLabelText("일본어 원문").value, other.source),
  );
});
test("React approve-and-next retains the intended successor when the status filter removes the approved row", async (t) => {
  const p = await setup(t);
  await p.upload([
    { name: "one.zip", bytes: bytes() },
    { name: "two.zip", bytes: bytes("次へ") },
    { name: "three.zip", bytes: bytes("最後") },
  ]);
  const data = await (
    await p.app.request("http://localhost/api/ui/imports", {
      headers: { host: "localhost" },
    })
  ).json();
  await p.user.click(p.screen.getByRole("combobox", { name: "검수 상태" }));
  await p.user.click(await p.screen.findByRole("option", { name: "새 문구" }));
  await p.navigate(`/ui?view=imports&item=${data.tasks[1].id}`);
  await p.waitFor(() =>
    assert.equal(
      p.screen.getByLabelText("일본어 원문").value,
      data.tasks[1].source,
    ),
  );
  await p.user.type(p.screen.getByLabelText("한국어 번역"), "한국어");
  await p.user.click(p.screen.getByRole("button", { name: "승인하고 다음" }));
  await p.waitFor(() =>
    assert.equal(
      p.screen.getByLabelText("일본어 원문").value,
      data.tasks[2].source,
    ),
  );
});
test("React import refresh preserves drafts and explicit reload recovers a revision conflict", async (t) => {
  const p = await setup(t);
  await p.upload([{ name: "one.zip", bytes: bytes() }]);
  await p.user.type(await p.screen.findByLabelText("한국어 번역"), "첫 번역");
  await p.user.click(p.screen.getByRole("button", { name: "초안 저장" }));
  const list = async () =>
    (
      await p.app.request("http://localhost/api/ui/imports", {
        headers: { host: "localhost" },
      })
    ).json();
  await p.waitFor(async () =>
    assert.equal((await list()).tasks[0].target, "첫 번역"),
  );
  await p.waitFor(() =>
    assert.equal(p.screen.getByLabelText("한국어 번역").disabled, false),
  );
  await p.user.clear(p.screen.getByLabelText("한국어 번역"));
  await p.user.type(p.screen.getByLabelText("한국어 번역"), "작성 중");
  const task = (await list()).tasks[0];
  const response = await p.app.request(
    `http://localhost/api/ui/imports/${task.id}`,
    {
      method: "PUT",
      headers: { host: "localhost", "content-type": "application/json" },
      body: JSON.stringify({
        action: "save-draft",
        target: "외부 수정",
        revision: task.revision,
      }),
    },
  );
  assert.equal(response.status, 200);
  await p.user.click(
    p.screen.getByRole("button", { name: "새로고침", exact: true }),
  );
  await p.waitFor(() =>
    assert.ok(p.screen.getByText("외부 수정", { exact: true })),
  );
  assert.equal(p.screen.getByLabelText("한국어 번역").value, "작성 중");
  await p.user.click(p.screen.getByRole("button", { name: "초안 저장" }));
  await p.waitFor(() =>
    assert.match(p.dom.window.document.body.textContent!, /변경되었습니다/),
  );
  assert.equal(p.screen.getByLabelText("한국어 번역").value, "작성 중");
  await p.user.click(
    p.screen.getByRole("button", { name: "최신 번역 다시 불러오기" }),
  );
  await p.user.click(
    await p.screen.findByRole("button", { name: "계속 편집" }),
  );
  assert.equal(p.screen.getByLabelText("한국어 번역").value, "작성 중");
  await p.user.click(
    p.screen.getByRole("button", { name: "최신 번역 다시 불러오기" }),
  );
  await p.user.click(
    await p.screen.findByRole("button", { name: "변경 버리고 새로고침" }),
  );
  await p.waitFor(() =>
    assert.equal(p.screen.getByLabelText("한국어 번역").value, "외부 수정"),
  );
  await p.user.click(p.screen.getByRole("button", { name: "승인하고 다음" }));
  await p.waitFor(async () =>
    assert.equal((await list()).tasks[0].status, "approved"),
  );
});
